import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { Effect, Queue, Stream } from 'effect';
import {
  downloadsCache,
  fetchThroughDownloads,
} from '../../downloads/index.ts';
import type { Word } from '../../transcript/index.ts';
import { engineFailure, type EngineError } from '../engine.ts';
import type { LoadStep } from '../progress.ts';

/**
 * Encoder in fp32: the v4 WebGPU runtime loses precision in fp16 and shifts
 * word timings. Decoder in q4 keeps the download small.
 */
const dtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' } as const;

/** The weight files that dtype makes Transformers.js fetch. */
export const weightFiles = [
  'onnx/encoder_model.onnx',
  'onnx/decoder_model_merged_q4.onnx',
] as const;

export const fileUrl = (repository: string, file: string): string =>
  `https://huggingface.co/${repository}/resolve/main/${file}`;

export type Whisper = AutomaticSpeechRecognitionPipeline;

/**
 * Loads the pipeline, emitting each file's download as Transformers.js pulls
 * it and then the pipeline itself. Imports Transformers.js on first use, so
 * only the worker pays for it. Transformers.js cannot be interrupted, so when
 * the stream is, its downloads are aborted and the pipeline fails behind it.
 */
export const loadWhisper = (
  repository: string,
  ready: (whisper: Whisper) => LoadStep,
): Stream.Stream<LoadStep, EngineError> =>
  Stream.callback<LoadStep, EngineError>((queue) =>
    Effect.gen(function* () {
      const report = (step: LoadStep) => Queue.offerUnsafe(queue, step);
      const abort = new AbortController();
      yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()));
      const whisper = yield* Effect.tryPromise({
        try: async () => {
          const { env, pipeline } = await import('@huggingface/transformers');
          env.useBrowserCache = false;
          env.useCustomCache = true;
          env.customCache = downloadsCache;
          env.fetch = fetchThroughDownloads(
            (url, { loaded, total, fetched }) =>
              report({ _tag: 'File', url, loaded, total, fetched }),
            abort.signal,
          );
          return pipeline('automatic-speech-recognition', repository, {
            device: 'webgpu',
            dtype,
          });
        },
        catch: engineFailure,
      });
      yield* Queue.offer(queue, ready(whisper));
      yield* Queue.end(queue);
    }),
  );

/** Runs one window; word times come back shifted onto the audio clock. */
export const transcribeWindow = (
  whisper: Whisper,
  samples: Float32Array,
  offset: number,
): Effect.Effect<ReadonlyArray<Word>, EngineError> =>
  Effect.tryPromise({
    try: () => whisper(samples, { return_timestamps: 'word' }),
    catch: engineFailure,
  }).pipe(
    Effect.map((output) => {
      const chunks = Array.isArray(output) ? output[0]?.chunks : output.chunks;
      const words: Array<Word> = [];
      for (const chunk of chunks ?? []) {
        const text = chunk.text.trim();
        const [start, end] = chunk.timestamp;
        if (text.length === 0 || start === null) continue;
        words.push({
          text,
          start: offset + start,
          end: offset + (end ?? start),
        });
      }
      return words;
    }),
  );
