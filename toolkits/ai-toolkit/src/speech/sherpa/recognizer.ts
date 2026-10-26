import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Effect, Semaphore } from 'effect';
import {
  SAMPLE_RATE,
  SpeechToTextError,
  type Recognizer,
} from '../contract/index.js';

/*
 * The one typed wrapper around sherpa-onnx-node, and the only code that
 * touches it. The package is fetched into the model's folder, and
 * sherpa.ts hands it in. It loads its native addon as it is required, so it is
 * required on the first load, never before: a Connection that never turns
 * Speech to Text on never fetches or loads it. Loading and decoding run off the main
 * thread (`createAsync`, `decodeAsync`), so the server never blocks; one
 * clip is decoded at a time.
 */

/** Threads for one decode: enough to be quick, leaving the rest for the Coding Harnesses. */
const THREADS = Math.min(4, availableParallelism());

/** The files of Parakeet TDT 0.6b v2 int8, as its tarball holds them. */
export const MODEL_FILES = [
  'encoder.int8.onnx',
  'decoder.int8.onnx',
  'joiner.int8.onnx',
  'tokens.txt',
] as const;

const failed = (message: string) => (cause: unknown) =>
  new SpeechToTextError({ message, cause });

/**
 * Parakeet, loaded from the files in `folder` with the sherpa-onnx that
 * `load` requires.
 */
export const loadRecognizer = (
  folder: string,
  load: () => typeof import('sherpa-onnx-node'),
) =>
  Effect.gen(function* () {
    const sherpa = yield* Effect.try({
      try: load,
      catch: failed('sherpa-onnx does not run on this computer'),
    });
    const recognizer = yield* Effect.tryPromise({
      try: () =>
        sherpa.OfflineRecognizer.createAsync({
          featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
          modelConfig: {
            transducer: {
              encoder: join(folder, 'encoder.int8.onnx'),
              decoder: join(folder, 'decoder.int8.onnx'),
              joiner: join(folder, 'joiner.int8.onnx'),
            },
            tokens: join(folder, 'tokens.txt'),
            modelType: 'nemo_transducer',
            numThreads: THREADS,
            provider: 'cpu',
            debug: 0,
          },
        }),
      catch: failed(`The model in ${folder} could not be loaded`),
    });
    const lock = yield* Semaphore.make(1);
    const transcribe: Recognizer['transcribe'] = (samples) =>
      samples.length === 0
        ? Effect.succeed('')
        : Effect.tryPromise({
            try: () => {
              const stream = recognizer.createStream();
              stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
              return recognizer.decodeAsync(stream);
            },
            catch: failed('The audio could not be transcribed'),
          }).pipe(
            Effect.map((result) => result.text.trim()),
            lock.withPermits(1),
          );
    return { transcribe } satisfies Recognizer;
  });
