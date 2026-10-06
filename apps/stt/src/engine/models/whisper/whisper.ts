/**
 * Whisper through Transformers.js on WebGPU: English models with word
 * timestamps from cross-attention.
 */
import { Effect, Stream } from 'effect';
import { clearDownloads, readDownloads } from '../../downloads/index.ts';
import {
  EngineError,
  engineFailure,
  nothingCached,
  requireWebGpu,
  type SpeechEngine,
  type SpeechModel,
} from '../engine.ts';
import { toLoading } from '../progress.ts';
import {
  fileUrl,
  loadWhisper,
  transcribeWindow,
  weightFiles,
} from './pipeline.ts';

interface WhisperModel extends SpeechModel {
  /** Hugging Face repository holding the word-timestamp ONNX export. */
  readonly repository: string;
}

const models: ReadonlyArray<WhisperModel> = [
  {
    id: 'whisper-tiny.en',
    label: 'Whisper tiny',
    repository: 'onnx-community/whisper-tiny.en_timestamped',
    downloadMegabytes: 120,
    note: 'Light enough for phones',
  },
  {
    id: 'whisper-base.en',
    label: 'Whisper base',
    repository: 'onnx-community/whisper-base.en_timestamped',
    downloadMegabytes: 207,
    note: 'Quick to settle',
  },
  {
    id: 'whisper-small.en',
    label: 'Whisper small',
    repository: 'onnx-community/whisper-small.en_timestamped',
    downloadMegabytes: 586,
    note: 'More accurate, slower',
  },
];

const modelOf = (id: string): Effect.Effect<WhisperModel, EngineError> => {
  const model = models.find((entry) => entry.id === id);
  return model
    ? Effect.succeed(model)
    : Effect.fail(new EngineError({ message: `Whisper has no model ${id}.` }));
};

/** The weights stand for the model; its small JSON files come along with them. */
const weightUrlsOf = (model: WhisperModel): ReadonlyArray<string> =>
  weightFiles.map((file) => fileUrl(model.repository, file));

export const whisperEngine: SpeechEngine = {
  models,
  load: (id) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const model = yield* modelOf(id);
        yield* requireWebGpu;
        return loadWhisper(model.repository, (whisper) => ({
          _tag: 'Ready',
          recognizer: {
            transcribe: (samples, offset) =>
              transcribeWindow(whisper, samples, offset),
            dispose: Effect.promise(() => whisper.dispose()).pipe(
              Effect.ignore,
            ),
          },
        })).pipe(toLoading(model.downloadMegabytes * 1_000_000));
      }),
    ),
  readCache: (id) =>
    modelOf(id).pipe(
      Effect.flatMap((model) => readDownloads(weightUrlsOf(model))),
      Effect.orElseSucceed(() => nothingCached),
    ),
  clearCache: (id) =>
    modelOf(id).pipe(
      Effect.flatMap((model) =>
        clearDownloads(weightUrlsOf(model)).pipe(
          Effect.mapError(engineFailure),
        ),
      ),
    ),
};
