import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Context, Data, Effect, Layer, Semaphore, Stream } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { SpeechToText, type Recognizer } from './contract/index.js';
import { SpeechModel } from './actor-speech-model/index.js';
import { SpeechHost } from './capabilities/index.js';

// What a program gives Speech: a SpeechToText, sherpa-onnx's unless a fake.
export { SpeechToText, type Recognizer } from './contract/index.js';
export { sherpa } from './sherpa/index.js';

/*
 * Speech to Text's front door, as the API reaches it (ADR 0017). Switching
 * it on or off is a Message to the speech model; how it stands is the
 * model's State; a transcription is a Query of the model while Ready.
 *
 * Everything lives in one folder of the Machine's data folder: the wish,
 * `on`, kept while Speech to Text is switched on, and the model's files in
 * `model/`. Switching off deletes the folder. speech.ts builds the
 * SpeechHost the model stands on from SpeechToText and that folder.
 */

/** Speech to Text is not ready on this Machine: off, still downloading, or failed. */
export class SpeechToTextNotReady extends Data.TaggedError(
  'SpeechToTextNotReady',
)<{
  readonly state: 'Off' | 'Downloading' | 'Failed';
}> {}

/** The model would not load, or could not make out the audio. */
export class TranscriptionFailed extends Data.TaggedError(
  'TranscriptionFailed',
)<{
  readonly message: string;
}> {}

/** How Speech to Text stands on this Machine. */
export type SpeechToTextStatus =
  | { readonly _tag: 'Off' }
  /** Bytes of the model downloaded, of `total` once the server says it. */
  | {
      readonly _tag: 'Downloading';
      readonly done: number;
      readonly total: number | null;
    }
  | { readonly _tag: 'Ready' }
  /** Enabling again tries again. */
  | { readonly _tag: 'Failed'; readonly reason: string };

export interface SpeechService {
  /** Switches it on, at once; the model downloads after, unless it is there. */
  readonly enable: Effect.Effect<void>;
  /** Switches it off, deleting the model. */
  readonly disable: Effect.Effect<void>;
  /** How it stands now, then each change. */
  readonly watch: Stream.Stream<SpeechToTextStatus>;
  /** The text spoken in 16 kHz mono PCM, each sample 16-bit signed little-endian. */
  readonly transcribe: (
    pcm: Uint8Array,
  ) => Effect.Effect<string, SpeechToTextNotReady | TranscriptionFailed>;
}

export interface SpeechOptions {
  /** The folder Speech to Text keeps its wish and model in. */
  readonly folder: string;
}

const exists = (path: string) =>
  Effect.promise(() =>
    access(path).then(
      () => true,
      () => false,
    ),
  );

/** 16-bit signed little-endian samples as floats in [-1, 1]. */
const samplesOf = (pcm: Uint8Array) => {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = new Float32Array(pcm.byteLength / 2);
  for (let at = 0; at < samples.length; at++)
    samples[at] = view.getInt16(at * 2, true) / 32768;
  return samples;
};

const host = (folder: string) =>
  Effect.gen(function* () {
    const speech = yield* SpeechToText;
    const model = join(folder, 'model');
    const wish = join(folder, 'on');
    // Fetching and deleting never overlap; a fetch stopped by Disable lets go first.
    const disk = yield* Semaphore.make(1);
    const loading = yield* Semaphore.make(1);
    let loaded: Recognizer | undefined;
    const recognizer = loading.withPermits(1)(
      Effect.suspend(() =>
        loaded
          ? Effect.succeed(loaded)
          : Effect.tap(speech.load(model), (made) =>
              Effect.sync(() => {
                loaded = made;
              }),
            ),
      ),
    );
    const service: SpeechHost['Service'] = {
      wished: exists(wish),
      installed: speech.installed(model),
      install: (progress) =>
        Effect.tryPromise({
          try: async () => {
            await mkdir(folder, { recursive: true });
            await writeFile(wish, '');
          },
          catch: () => `Could not write ${wish}`,
        }).pipe(
          Effect.andThen(
            Effect.mapError(
              speech.install(model, progress),
              (error) => error.message,
            ),
          ),
          disk.withPermits(1),
        ),
      transcribe: (samples) =>
        Effect.flatMap(recognizer, (made) => made.transcribe(samples)).pipe(
          Effect.mapError((error) => error.message),
        ),
      remove: Effect.sync(() => {
        loaded = undefined;
      }).pipe(
        Effect.andThen(
          Effect.promise(() => rm(folder, { recursive: true, force: true })),
        ),
        disk.withPermits(1),
      ),
    };
    return service;
  });

const make = (options: SpeechOptions) =>
  Effect.gen(function* () {
    const running = yield* Runtime.start(
      SpeechModel,
      Layer.succeed(SpeechHost, yield* host(options.folder)),
    );
    const root = running.instance({ from: 'rpc' });
    // The model reads the wish and the files first; it is open once it knows.
    yield* running.changes.pipe(
      Stream.filter(() => root._tag !== 'Loading'),
      Stream.runHead,
    );

    const status = (): SpeechToTextStatus | null =>
      root._tag === 'Loading' ? null : root.state;
    const notReady = () =>
      new SpeechToTextNotReady({
        state:
          root._tag === 'Downloading' || root._tag === 'Failed'
            ? root._tag
            : 'Off',
      });

    const service: SpeechService = {
      enable: Effect.sync(() => void root.send({ _tag: 'Enable' })),
      disable: Effect.sync(() => void root.send({ _tag: 'Disable' })),
      watch: running.changes.pipe(
        Stream.map(status),
        Stream.filter((now) => now !== null),
        Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      ),
      transcribe: (pcm) =>
        Effect.suspend(() => {
          if (pcm.byteLength % 2 !== 0)
            return Effect.fail(
              new TranscriptionFailed({
                message: 'The audio is not 16-bit PCM: its length is odd',
              }),
            );
          if (root._tag !== 'Ready') return Effect.fail(notReady());
          return root.queries
            .transcribe(samplesOf(pcm))
            .pipe(
              Effect.mapError((error) =>
                typeof error === 'string'
                  ? new TranscriptionFailed({ message: error })
                  : notReady(),
              ),
            );
        }),
    };
    return service;
  });

export class Speech extends Context.Service<Speech, SpeechService>()(
  '@kestack/ai-toolkit/Speech',
) {
  /** Runs Speech to Text until its Scope closes, from the wish and files in `folder`. */
  static readonly layer = (
    options: SpeechOptions,
  ): Layer.Layer<Speech, never, SpeechToText> =>
    Layer.effect(Speech, make(options));
}
