/**
 * The page's handle on the synthesis worker: load Kokoro with progress, then
 * speak sentences. One worker, spawned on first use.
 */
import { Context, Effect, Layer, Stream } from 'effect';
import { RpcClient } from 'effect/unstable/rpc';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import { BrowserWorker } from '@effect/platform-browser';
import {
  SynthesisError,
  SynthesisRpcs,
  type SpokenSentence,
  type VoiceModelProgress,
} from '../synthesis-protocol/index.ts';
import type { VoiceId } from '../synthesis-protocol/index.ts';

export interface SynthesizerService {
  readonly load: Stream.Stream<VoiceModelProgress, SynthesisError>;
  readonly speak: (
    sentences: ReadonlyArray<string>,
    voice: VoiceId,
  ) => Stream.Stream<SpokenSentence, SynthesisError>;
}

/** A transport failure to the worker reads as the operation failing. */
const transportFailed =
  (reason: SynthesisError['reason']) =>
  <A>(stream: Stream.Stream<A, SynthesisError | RpcClientError>) =>
    stream.pipe(
      Stream.catchTag('RpcClientError', (error) =>
        Stream.fail(new SynthesisError({ reason, message: error.message })),
      ),
    );

export class Synthesizer extends Context.Service<
  Synthesizer,
  SynthesizerService
>()('stt/Synthesizer') {
  static readonly layer: Layer.Layer<Synthesizer> = Layer.effect(
    Synthesizer,
    Effect.gen(function* () {
      const client = yield* RpcClient.make(SynthesisRpcs);
      return {
        load: client.LoadVoiceModel().pipe(transportFailed('load-failed')),
        speak: (sentences, voice) =>
          client
            .Speak({ sentences, voice })
            .pipe(transportFailed('speak-failed')),
      };
    }),
  ).pipe(
    Layer.provide(RpcClient.layerProtocolWorker({ size: 1 })),
    Layer.provide(
      BrowserWorker.layer(
        () =>
          new Worker(
            new URL('../../speech-synthesis.worker.ts', import.meta.url),
            { type: 'module' },
          ),
      ),
    ),
    Layer.orDie,
  );
}
