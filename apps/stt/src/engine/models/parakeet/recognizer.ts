import { Effect } from 'effect';
import type { FromUrlsConfig, ParakeetModel } from 'parakeet.js';
import { readDownload } from '../../downloads/index.ts';
import type { Word } from '../../transcript/index.ts';
import { EngineError, engineFailure } from '../engine.ts';

const sampleRate = 16_000;

/** ONNX Runtime sessions the model holds; parakeet.js has no dispose of its own. */
interface Sessions {
  readonly encoderSession?: { release?: () => Promise<void> };
  readonly joinerSession?: { release?: () => Promise<void> };
}

/** The zeroed LSTM state parakeet.js seeds the decoder with, sized for two layers. */
interface DecoderSeed {
  predLayers: number;
  predHidden: number;
  _combState1: { readonly constructor: TensorConstructor };
  _combState2: unknown;
}
type TensorConstructor = new (
  type: 'float32',
  data: Float32Array,
  dims: ReadonlyArray<number>,
) => DecoderSeed['_combState1'];

/**
 * parakeet.js assumes a two-layer prediction network; smaller models have
 * one, so the seed state is rebuilt to their shape.
 */
const fitDecoderLayers = (model: ParakeetModel, layers: number): void => {
  const seed = model as unknown as DecoderSeed;
  if (seed.predLayers === layers) return;
  const Tensor = seed._combState1.constructor;
  const dims = [layers, 1, seed.predHidden];
  seed.predLayers = layers;
  seed._combState1 = new Tensor(
    'float32',
    new Float32Array(layers * seed.predHidden),
    dims,
  );
  seed._combState2 = new Tensor(
    'float32',
    new Float32Array(layers * seed.predHidden),
    dims,
  );
};

/** The files one variant downloads, by their names in its repository. */
export interface ParakeetFiles {
  readonly encoder: string;
  readonly decoder: string;
}

/** How the variant runs, passed through to parakeet.js. */
export type ParakeetRuntime = Pick<
  FromUrlsConfig,
  'backend' | 'nMels' | 'cpuThreads'
>;

/** Where a variant's files live on the Hugging Face hub. */
export const fileUrl = (repository: string, file: string): string =>
  `https://huggingface.co/${repository}/resolve/main/${file}`;

/** The weights and vocabulary one variant needs, in load order. */
export const filesOf = (
  repository: string,
  files: ParakeetFiles,
): ReadonlyArray<string> =>
  [files.encoder, files.decoder, 'vocab.txt'].map((file) =>
    fileUrl(repository, file),
  );

/** A downloaded file as a blob URL, revoked when the scope closes. */
const blobUrlOf = (url: string) =>
  Effect.acquireRelease(
    readDownload(url).pipe(
      Effect.mapError(engineFailure),
      Effect.flatMap((file) =>
        file
          ? Effect.succeed(URL.createObjectURL(file))
          : Effect.fail(
              new EngineError({ message: `${url} is not downloaded.` }),
            ),
      ),
    ),
    (blobUrl) => Effect.sync(() => URL.revokeObjectURL(blobUrl)),
  );

/**
 * Builds the model from files the downloader already holds. Imports
 * parakeet.js on first use, so only the worker pays for it; building from
 * URLs also serves quantisations its own hub loader cannot name, such as int4.
 */
export const loadParakeet = (
  repository: string,
  files: ParakeetFiles,
  runtime: ParakeetRuntime,
  decoderLayers: number,
): Effect.Effect<ParakeetModel, EngineError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const [encoderUrl, decoderUrl, tokenizerUrl] = yield* Effect.forEach(
        filesOf(repository, files),
        blobUrlOf,
      );
      const model = yield* Effect.tryPromise({
        try: async () => {
          const { ParakeetModel } = await import('parakeet.js');
          return ParakeetModel.fromUrls({
            ...runtime,
            encoderUrl: encoderUrl!,
            decoderUrl: decoderUrl!,
            tokenizerUrl: tokenizerUrl!,
            filenames: files,
            preprocessorBackend: 'js',
          });
        },
        catch: engineFailure,
      });
      fitDecoderLayers(model, decoderLayers);
      return model;
    }),
  );

/** Runs one window; the TDT decoder times every word, shifted onto the audio clock. */
export const transcribeWindow = (
  model: ParakeetModel,
  samples: Float32Array,
  offset: number,
): Effect.Effect<ReadonlyArray<Word>, EngineError> =>
  Effect.tryPromise({
    try: () =>
      model.transcribe(samples, sampleRate, {
        returnTimestamps: true,
        timeOffset: offset,
      }),
    catch: engineFailure,
  }).pipe(
    Effect.map((result) =>
      result.words.flatMap((word) => {
        const text = word.text.trim();
        return text.length === 0
          ? []
          : [{ text, start: word.start_time, end: word.end_time }];
      }),
    ),
  );

/** Frees both ONNX Runtime sessions; a failed release leaves nothing to do. */
export const releaseParakeet = (model: ParakeetModel): Effect.Effect<void> =>
  Effect.promise(async () => {
    const { encoderSession, joinerSession } = model as unknown as Sessions;
    await encoderSession?.release?.();
    await joinerSession?.release?.();
  }).pipe(Effect.ignore);
