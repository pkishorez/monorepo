/**
 * NVIDIA Parakeet through parakeet.js: TDT models whose decoder times every
 * token, so words come with timestamps. WebGPU runs the encoder; the int8
 * build only runs on the CPU.
 */
import { Effect, Stream } from 'effect';
import {
  clearDownloads,
  download,
  readDownloads,
} from '../../downloads/index.ts';
import {
  EngineError,
  engineFailure,
  nothingCached,
  requireWebGpu,
  type SpeechEngine,
  type SpeechModel,
} from '../engine.ts';
import { toLoading, type LoadStep } from '../progress.ts';
import {
  filesOf,
  loadParakeet,
  releaseParakeet,
  transcribeWindow,
  type ParakeetFiles,
  type ParakeetRuntime,
} from './recognizer.ts';

interface ParakeetVariant extends SpeechModel {
  readonly repository: string;
  readonly files: ParakeetFiles;
  /** LSTM layers in the prediction network. */
  readonly decoderLayers: number;
  readonly runtime: ParakeetRuntime;
}

const models: ReadonlyArray<ParakeetVariant> = [
  {
    id: 'parakeet-tdt-ctc-110m',
    label: 'Parakeet 110M',
    note: 'Fast and small',
    downloadMegabytes: 240,
    repository: 'shockz1/parakeet-tdt_ctc-110m-fp16-onnx',
    files: {
      encoder: 'encoder-model.fp16.onnx',
      decoder: 'decoder_joint-model.fp16.onnx',
    },
    decoderLayers: 1,
    runtime: { backend: 'webgpu', nMels: 80 },
  },
  {
    id: 'parakeet-tdt-0.6b-v3-int4',
    label: 'Parakeet 0.6B int4',
    note: 'Accurate and small, on WebGPU',
    downloadMegabytes: 409,
    repository: 'efederici/parakeet-tdt-0.6b-v3-onnx-int4',
    files: {
      encoder: 'encoder-model.int4.onnx',
      decoder: 'decoder_joint-model.int8.onnx',
    },
    decoderLayers: 2,
    runtime: { backend: 'webgpu' },
  },
  {
    id: 'parakeet-tdt-0.6b-v2-int8',
    label: 'Parakeet 0.6B int8',
    note: 'Accurate, runs on the CPU',
    downloadMegabytes: 661,
    repository: 'ysdede/parakeet-tdt-0.6b-v2-onnx',
    files: {
      encoder: 'encoder-model.int8.onnx',
      decoder: 'decoder_joint-model.int8.onnx',
    },
    decoderLayers: 2,
    runtime: { backend: 'wasm', cpuThreads: navigator.hardwareConcurrency },
  },
];

const variantOf = (id: string): Effect.Effect<ParakeetVariant, EngineError> => {
  const model = models.find((entry) => entry.id === id);
  return model
    ? Effect.succeed(model)
    : Effect.fail(new EngineError({ message: `Parakeet has no model ${id}.` }));
};

/** Each file in turn, so one file's bytes are not split with another's. */
const downloadFiles = (
  urls: ReadonlyArray<string>,
): Stream.Stream<LoadStep, EngineError> =>
  Stream.fromIterable(urls).pipe(
    Stream.flatMap(
      (url) =>
        download(url).pipe(
          Stream.map(({ loaded, total, fetched }): LoadStep => ({
            _tag: 'File',
            url,
            loaded,
            total,
            fetched,
          })),
        ),
      { concurrency: 1 },
    ),
    Stream.mapError(engineFailure),
  );

const built = (
  variant: ParakeetVariant,
): Stream.Stream<LoadStep, EngineError> =>
  Stream.fromEffect(
    loadParakeet(
      variant.repository,
      variant.files,
      variant.runtime,
      variant.decoderLayers,
    ).pipe(
      Effect.map((model): LoadStep => ({
        _tag: 'Ready',
        recognizer: {
          transcribe: (samples, offset) =>
            transcribeWindow(model, samples, offset),
          dispose: releaseParakeet(model),
        },
      })),
    ),
  );

export const parakeetEngine: SpeechEngine = {
  models,
  load: (id) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const variant = yield* variantOf(id);
        if (variant.runtime.backend !== 'wasm') yield* requireWebGpu;
        const urls = filesOf(variant.repository, variant.files);
        return Stream.concat(downloadFiles(urls), built(variant)).pipe(
          toLoading(variant.downloadMegabytes * 1_000_000),
        );
      }),
    ),
  readCache: (id) =>
    variantOf(id).pipe(
      Effect.flatMap((variant) =>
        readDownloads(filesOf(variant.repository, variant.files)),
      ),
      Effect.orElseSucceed(() => nothingCached),
    ),
  clearCache: (id) =>
    variantOf(id).pipe(
      Effect.flatMap((variant) =>
        clearDownloads(filesOf(variant.repository, variant.files)).pipe(
          Effect.mapError(engineFailure),
        ),
      ),
    ),
};
