import { pipeline } from '@huggingface/transformers';
import type {
  AutomaticSpeechRecognitionPipeline,
  ProgressInfo,
} from '@huggingface/transformers';
import type { Word } from '../transcript/index.ts';

/**
 * Encoder in fp32: the v4 WebGPU runtime loses precision in fp16 and shifts
 * word timings. Decoder in q4 keeps the download small.
 */
const dtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' } as const;

export const requireWebGpu = async (): Promise<void> => {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  const adapter = gpu ? await gpu.requestAdapter() : null;
  if (!adapter) throw new Error('This browser has no WebGPU adapter.');
};

export type Whisper = AutomaticSpeechRecognitionPipeline;

export const loadWhisper = (
  repository: string,
  onProgress: (info: ProgressInfo) => void,
): Promise<Whisper> =>
  pipeline('automatic-speech-recognition', repository, {
    device: 'webgpu',
    dtype,
    progress_callback: onProgress,
  });

/** Runs one window; word times come back shifted onto the audio clock. */
export const transcribeWindow = async (
  whisper: Whisper,
  samples: Float32Array,
  offset: number,
): Promise<Array<Word>> => {
  const output = await whisper(samples, { return_timestamps: 'word' });
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
};
