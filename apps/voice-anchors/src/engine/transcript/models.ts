import { Schema } from 'effect';

/** The two English speech models the demo can run on WebGPU. */
export const SpeechModelId = Schema.Literals(['base.en', 'small.en']);
export type SpeechModelId = typeof SpeechModelId.Type;

export interface SpeechModel {
  readonly id: SpeechModelId;
  readonly label: string;
  /** Hugging Face repository holding the word-timestamp ONNX export. */
  readonly repository: string;
  readonly downloadMegabytes: number;
  readonly note: string;
}

export const speechModels: ReadonlyArray<SpeechModel> = [
  {
    id: 'base.en',
    label: 'Whisper base (English)',
    repository: 'onnx-community/whisper-base.en_timestamped',
    downloadMegabytes: 207,
    note: 'Fastest passes, so the transcript settles sooner. Lower accuracy.',
  },
  {
    id: 'small.en',
    label: 'Whisper small (English)',
    repository: 'onnx-community/whisper-small.en_timestamped',
    downloadMegabytes: 586,
    note: 'Better words and timings. Each pass takes longer, so the tail lags more.',
  },
];

export const speechModel = (id: SpeechModelId): SpeechModel =>
  speechModels.find((model) => model.id === id)!;
