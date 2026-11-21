import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect, Layer, Semaphore, Stream } from 'effect';
import { Runtime } from '@kestack/kabuki';
import {
  Speech,
  SpeechToText,
  SpeechToTextNotReady,
  TranscriptionFailed,
  type Recognizer,
  type SpeechService,
  type SpeechToTextStatus,
} from './contract/index.js';
import { SpeechModel } from './actor-speech-model/index.js';
import { SpeechHost } from './capabilities/index.js';
import { makeTakes } from './takes/index.js';

/*
 * Speech to Text's front door, as the API reaches it (ADR 0017). Switching
 * it on or off is a Message to the speech model; how it stands is the
 * model's State; a transcription is a Query of the model while Ready.
 *
 * Everything lives in one folder of the Connection's data folder: the wish,
 * `on`, kept while Speech to Text is switched on, and the model's files in
 * `model/`. Switching off deletes the folder. speech.ts builds the
 * SpeechHost the model stands on from SpeechToText and that folder.
 */

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
    const running = yield* Runtime.scoped(SpeechModel, {
      layer: Layer.succeed(SpeechHost, yield* host(options.folder)),
    });
    const root = running.root;
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

    const enable = Effect.sync(() => void root.send({ _tag: 'Enable' }));
    const watch = running.changes.pipe(
      Stream.map(status),
      Stream.filter((now) => now !== null),
      Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    );
    const takes = yield* makeTakes({
      now: watch,
      enable,
      transcribe: (samples) =>
        root._tag === 'Ready'
          ? root.queries
              .transcribe(samples)
              .pipe(
                Effect.mapError((error) =>
                  typeof error === 'string'
                    ? error
                    : 'Speech to Text stopped while it was hearing',
                ),
              )
          : Effect.fail('Speech to Text stopped while it was hearing'),
    });
    const failed = (error: { readonly message: string }) =>
      new TranscriptionFailed({ message: error.message });

    const service: SpeechService = {
      enable,
      disable: Effect.sync(() => void root.send({ _tag: 'Disable' })),
      watch,
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
      watchTake: (id) => Stream.mapError(takes.watch(id), failed),
      addTakeAudio: (id, at, pcm) =>
        pcm.byteLength % 2 !== 0
          ? Effect.fail(
              new TranscriptionFailed({
                message: 'The audio is not 16-bit PCM: its length is odd',
              }),
            )
          : Effect.mapError(takes.add(id, at, samplesOf(pcm)), failed),
      endTake: (id, count) => Effect.mapError(takes.end(id, count), failed),
    };
    return service;
  });

/** `Speech`, run until its Scope closes from the wish and files in `options.folder`. */
export const speechLayer = (
  options: SpeechOptions,
): Layer.Layer<Speech, never, SpeechToText> =>
  Layer.effect(Speech, make(options));
