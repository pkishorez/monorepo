import { Effect, Layer, Stream, type Scope } from 'effect';
import { Runtime } from '@kestack/kabuki';
import {
  SpeechToTextNotReady,
  TranscriptionFailed,
  type SpeechService,
  type SpeechToTextStatus,
} from '../contract/index.js';
import { SpeechModel } from '../actor-speech-model/index.js';
import { SpeechHost } from '../capabilities/index.js';
import { makeTakes } from '../takes/index.js';

/*
 * Speech to Text's front door, as the API reaches it (ADR 0017), over the
 * SpeechHost the model stands on. Switching it on or off is a Message to
 * the speech model; how it stands is the model's State; a transcription
 * is a Query of the model while Ready; Takes are heard on it. Browser-safe:
 * `../speech.ts` gives it a host over a folder on Node, `../fake` one over
 * the Speech fake.
 */

/** 16-bit signed little-endian samples as floats in [-1, 1]. */
const samplesOf = (pcm: Uint8Array) => {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = new Float32Array(pcm.byteLength / 2);
  for (let at = 0; at < samples.length; at++)
    samples[at] = view.getInt16(at * 2, true) / 32768;
  return samples;
};

/** The speech model run on `host` until the Scope closes, and `Speech` over it. */
export const speechOver = (
  host: SpeechHost['Service'],
): Effect.Effect<SpeechService, never, Scope.Scope> =>
  Effect.gen(function* () {
    const running = yield* Runtime.scoped(SpeechModel, {
      layer: Layer.succeed(SpeechHost, host),
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
