/**
 * Kokoro inside the worker: loads the model through the downloader and
 * speaks one sentence at a time.
 */
import type { KokoroTTS } from 'kokoro-js';
import { Effect, Queue, Stream } from 'effect';
import { downloadsCache, fetchThroughDownloads } from '../downloads/index.ts';
import {
  SynthesisError,
  type SpokenSentence,
  type VoiceId,
} from '../synthesis-protocol/index.ts';

const repository = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/**
 * The 8-bit weights: a 92 MB download that runs on the CPU, leaving the GPU
 * to the speech model.
 */
const weightBytes = 92_361_116;

export type KokoroStep =
  | {
      readonly _tag: 'Download';
      readonly loaded: number;
      readonly total: number;
    }
  | { readonly _tag: 'Ready'; readonly kokoro: KokoroTTS };

const failed =
  (reason: SynthesisError['reason']) =>
  (cause: unknown): SynthesisError =>
    new SynthesisError({
      reason,
      message: cause instanceof Error ? cause.message : String(cause),
    });

/**
 * Loads Kokoro, emitting the bytes held across its files and then the model.
 * Transformers.js cannot be interrupted, so when the stream is, its downloads
 * are aborted and the load fails behind it.
 */
export const loadKokoro: Stream.Stream<KokoroStep, SynthesisError> =
  Stream.callback<KokoroStep, SynthesisError>((queue) =>
    Effect.gen(function* () {
      const files = new Map<string, { loaded: number; total: number }>();
      const abort = new AbortController();
      yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()));
      const kokoro = yield* Effect.tryPromise({
        try: async () => {
          const [{ KokoroTTS }, { env }] = await Promise.all([
            import('kokoro-js'),
            import('@huggingface/transformers'),
          ]);
          env.useBrowserCache = false;
          env.useCustomCache = true;
          env.customCache = downloadsCache;
          env.fetch = fetchThroughDownloads((url, { loaded, total }) => {
            files.set(url, { loaded, total });
            let held = 0;
            let size = 0;
            for (const file of files.values()) {
              held += file.loaded;
              size += file.total;
            }
            // Until the weights report their size, the listed size stands in.
            const known = Math.max(size, weightBytes);
            Queue.offerUnsafe(queue, {
              _tag: 'Download',
              loaded: Math.min(held, known),
              total: known,
            });
          }, abort.signal);
          return KokoroTTS.from_pretrained(repository, {
            dtype: 'q8',
            device: 'wasm',
          });
        },
        catch: failed('load-failed'),
      });
      yield* Queue.offer(queue, { _tag: 'Ready', kokoro });
      yield* Queue.end(queue);
    }),
  );

/**
 * Speaks the sentences in order. A sentence cannot be interrupted once
 * started, so a stopped stream ends after the one in progress and the next
 * request never overlaps it.
 */
export const speakSentences = (
  kokoro: KokoroTTS,
  sentences: ReadonlyArray<string>,
  voice: VoiceId,
): Stream.Stream<SpokenSentence, SynthesisError> =>
  Stream.fromIterable(sentences.entries()).pipe(
    Stream.mapEffect(([index, sentence]) =>
      Effect.tryPromise({
        try: () => kokoro.generate(sentence, { voice }),
        catch: failed('speak-failed'),
      }).pipe(
        Effect.uninterruptible,
        Effect.map((audio): SpokenSentence => ({
          index,
          // A copy: the model's output may sit in shared memory, which cannot move.
          samples: new Float32Array(audio.data),
          sampleRate: audio.sampling_rate,
        })),
      ),
    ),
  );
