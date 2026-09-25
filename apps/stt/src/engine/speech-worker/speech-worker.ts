/**
 * Serves the speech protocol inside a Web Worker: one loaded model from the
 * model catalog, released when another is chosen, and transcription of
 * audio windows.
 */
import { Effect, Layer, Ref, Stream } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import { BrowserWorkerRunner } from '@effect/platform-browser';
import {
  LoadProgress,
  SpeechError,
  SpeechRpcs,
} from '../speech-protocol/index.ts';
import { loadSpeechModel, type Loading } from '../models/index.ts';

type Recognizer = Extract<Loading, { _tag: 'Ready' }>['recognizer'];

/** Progress fires per network chunk; the page needs about ten frames a second. */
const progressIntervalMs = 100;

/**
 * Drops download states that arrive within the interval of the last one kept.
 * The finished download and the ready model always pass.
 */
const sampled = () => {
  let keptAt = Number.NEGATIVE_INFINITY;
  return (loading: Loading): boolean => {
    if (loading._tag === 'Ready') return true;
    const now = performance.now();
    const done = loading.progress.loaded >= loading.progress.total;
    if (!done && now - keptAt < progressIntervalMs) return false;
    keptAt = now;
    return true;
  };
};

const handlers = SpeechRpcs.toLayer(
  Effect.gen(function* () {
    const loaded = yield* Ref.make<Recognizer | null>(null);

    /** Frees the previous model's GPU or WASM memory before the next loads. */
    const release = Effect.gen(function* () {
      const previous = yield* Ref.getAndSet(loaded, null);
      if (previous !== null) yield* previous.dispose;
    });

    const toProgress = (loading: Loading): Effect.Effect<LoadProgress> =>
      loading._tag === 'Ready'
        ? Ref.set(loaded, loading.recognizer).pipe(
            Effect.as<LoadProgress>({
              loaded: 1,
              total: 1,
              status: 'ready',
              fetched: 0,
            }),
          )
        : Effect.succeed({
            ...loading.progress,
            status: 'download' as const,
          });

    return {
      LoadModel: ({ model }) =>
        Stream.unwrap(
          Effect.as(
            release,
            loadSpeechModel(model).pipe(
              Stream.filter(sampled()),
              Stream.mapEffect(toProgress),
              Stream.mapError(
                (error) =>
                  new SpeechError({
                    reason: 'load-failed',
                    message: error.message,
                  }),
              ),
            ),
          ),
        ),

      Transcribe: ({ samples, offset }) =>
        Effect.gen(function* () {
          const recognizer = yield* Ref.get(loaded);
          if (recognizer === null) {
            return yield* new SpeechError({
              reason: 'not-loaded',
              message: 'Load a model before transcribing.',
            });
          }
          return yield* recognizer.transcribe(samples, offset).pipe(
            Effect.mapError(
              (error) =>
                new SpeechError({
                  reason: 'transcribe-failed',
                  message: error.message,
                }),
            ),
          );
        }),
    };
  }),
);

/** The whole worker program: RPC server over the worker's message port. */
export const speechWorkerLayer = RpcServer.layer(SpeechRpcs, {
  concurrency: 1,
}).pipe(
  Layer.provide(handlers),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
);
