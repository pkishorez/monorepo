/**
 * Serves the synthesis protocol inside a Web Worker. Kokoro loads once and
 * stays loaded for the life of the page.
 */
import type { KokoroTTS } from 'kokoro-js';
import { Effect, Layer, Ref, Stream } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import { BrowserWorkerRunner } from '@effect/platform-browser';
import { loadKokoro, speakSentences, type KokoroStep } from './kokoro.ts';
import {
  SynthesisError,
  SynthesisRpcs,
  type VoiceModelProgress,
} from '../synthesis-protocol/index.ts';

/** Progress fires per network chunk; the page needs about ten frames a second. */
const progressIntervalMs = 100;

/**
 * Drops download states that arrive within the interval of the last one kept.
 * The finished download and the ready model always pass.
 */
const sampled = () => {
  let keptAt = Number.NEGATIVE_INFINITY;
  return (step: KokoroStep): boolean => {
    if (step._tag === 'Ready') return true;
    const now = performance.now();
    if (step.loaded < step.total && now - keptAt < progressIntervalMs) {
      return false;
    }
    keptAt = now;
    return true;
  };
};

const ready: VoiceModelProgress = { loaded: 1, total: 1, status: 'ready' };

const handlers = SynthesisRpcs.toLayer(
  Effect.gen(function* () {
    const loaded = yield* Ref.make<KokoroTTS | null>(null);

    return {
      LoadVoiceModel: () =>
        Stream.unwrap(
          Effect.map(Ref.get(loaded), (kokoro) =>
            kokoro !== null
              ? Stream.make(ready)
              : loadKokoro.pipe(
                  Stream.filter(sampled()),
                  Stream.mapEffect((step) =>
                    step._tag === 'Ready'
                      ? Ref.set(loaded, step.kokoro).pipe(Effect.as(ready))
                      : Effect.succeed<VoiceModelProgress>({
                          loaded: step.loaded,
                          total: step.total,
                          status: 'download',
                        }),
                  ),
                ),
          ),
        ),

      Speak: ({ sentences, voice }) =>
        Stream.unwrap(
          Effect.map(Ref.get(loaded), (kokoro) =>
            kokoro === null
              ? Stream.fail(
                  new SynthesisError({
                    reason: 'not-loaded',
                    message: 'Load the voice model before speaking.',
                  }),
                )
              : speakSentences(kokoro, sentences, voice),
          ),
        ),
    };
  }),
);

/**
 * The whole worker program. One request at a time, so a new sentence never
 * starts while a stopped one is still being generated.
 */
export const synthesisWorkerLayer = RpcServer.layer(SynthesisRpcs, {
  concurrency: 1,
}).pipe(
  Layer.provide(handlers),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
);
