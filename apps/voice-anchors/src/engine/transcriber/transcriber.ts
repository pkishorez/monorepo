/**
 * The page's handle on the speech worker: load a model with progress, then
 * transcribe audio windows. One worker, spawned on first use.
 */
import { Context, Effect, Layer, Stream } from 'effect';
import { RpcClient } from 'effect/unstable/rpc';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import { BrowserWorker } from '@effect/platform-browser';
import {
  SpeechError,
  SpeechRpcs,
  type LoadProgress,
} from '../speech-protocol/index.ts';
import type { SpeechModelId, Word } from '../transcript/index.ts';

export interface TranscriberService {
  readonly load: (
    model: SpeechModelId,
  ) => Stream.Stream<LoadProgress, SpeechError>;
  readonly transcribe: (
    samples: Float32Array<ArrayBuffer>,
    offset: number,
  ) => Effect.Effect<ReadonlyArray<Word>, SpeechError>;
}

/** A transport failure to the worker reads as the operation failing. */
const transportFailed =
  (reason: SpeechError['reason']) =>
  (error: RpcClientError): SpeechError =>
    new SpeechError({ reason, message: error.message });

export class Transcriber extends Context.Service<
  Transcriber,
  TranscriberService
>()('voice-anchors/Transcriber') {
  static readonly layer: Layer.Layer<Transcriber> = Layer.effect(
    Transcriber,
    Effect.gen(function* () {
      const client = yield* RpcClient.make(SpeechRpcs);
      return {
        load: (model) =>
          client
            .LoadModel({ model })
            .pipe(
              Stream.catchTag('RpcClientError', (error) =>
                Stream.fail(transportFailed('load-failed')(error)),
              ),
            ),
        transcribe: (samples, offset) =>
          client
            .Transcribe({ samples, offset })
            .pipe(
              Effect.catchTag('RpcClientError', (error) =>
                Effect.fail(transportFailed('transcribe-failed')(error)),
              ),
            ),
      };
    }),
  ).pipe(
    Layer.provide(RpcClient.layerProtocolWorker({ size: 1 })),
    Layer.provide(
      BrowserWorker.layer(
        () =>
          new Worker(new URL('../../speech.worker.ts', import.meta.url), {
            type: 'module',
          }),
      ),
    ),
    Layer.orDie,
  );
}
