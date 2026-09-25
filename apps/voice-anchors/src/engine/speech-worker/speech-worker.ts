/**
 * Serves the speech protocol inside a Web Worker: one loaded Whisper model,
 * replaced when another model is chosen, and transcription of audio windows.
 */
import { Effect, Layer, Queue, Ref, Stream } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import { BrowserWorkerRunner } from '@effect/platform-browser';
import {
  LoadProgress,
  SpeechError,
  SpeechRpcs,
} from '../speech-protocol/index.ts';
import { speechModel, type SpeechModelId } from '../transcript/index.ts';
import {
  loadWhisper,
  requireWebGpu,
  transcribeWindow,
  type Whisper,
} from './whisper.ts';

type Loaded = { readonly id: SpeechModelId; readonly whisper: Whisper };

const handlers = SpeechRpcs.toLayer(
  Effect.gen(function* () {
    const loaded = yield* Ref.make<Loaded | null>(null);

    return {
      LoadModel: ({ model }) =>
        Stream.callback<LoadProgress, SpeechError>((queue) =>
          Effect.gen(function* () {
            yield* Effect.tryPromise({
              try: requireWebGpu,
              catch: (cause) =>
                new SpeechError({
                  reason: 'webgpu-unavailable',
                  message: String(cause),
                }),
            });
            const whisper = yield* Effect.tryPromise({
              try: () =>
                loadWhisper(speechModel(model).repository, (info) => {
                  if (info.status === 'progress') {
                    Queue.offerUnsafe(queue, {
                      file: info.file,
                      loaded: info.loaded,
                      total: info.total,
                      status: 'download',
                    });
                  }
                }),
              catch: (cause) =>
                new SpeechError({
                  reason: 'load-failed',
                  message:
                    cause instanceof Error ? cause.message : String(cause),
                }),
            });
            yield* Ref.set(loaded, { id: model, whisper });
            yield* Queue.offer(queue, {
              file: '',
              loaded: 1,
              total: 1,
              status: 'ready',
            });
            yield* Queue.end(queue);
          }),
        ),

      Transcribe: ({ samples, offset }) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(loaded);
          if (current === null) {
            return yield* new SpeechError({
              reason: 'not-loaded',
              message: 'Load a model before transcribing.',
            });
          }
          return yield* Effect.tryPromise({
            try: () => transcribeWindow(current.whisper, samples, offset),
            catch: (cause) =>
              new SpeechError({
                reason: 'transcribe-failed',
                message: cause instanceof Error ? cause.message : String(cause),
              }),
          });
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
