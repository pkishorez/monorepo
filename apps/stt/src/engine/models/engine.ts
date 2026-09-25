/**
 * The contract every speech engine fills in, so the catalog can offer its
 * models and the worker can run them without knowing which library is behind.
 */
import { Effect, Schema, type Stream } from 'effect';
import type { Word } from '../transcript/index.ts';

/** One model an engine can run, as the picker shows it. */
export interface SpeechModel {
  /** Unique across every engine. */
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly downloadMegabytes: number;
}

/** A model failed to load, transcribe or clear. */
export class EngineError extends Schema.TaggedError<EngineError>()(
  'EngineError',
  { message: Schema.String },
) {}

export const engineFailure = (cause: unknown): EngineError =>
  new EngineError({
    message:
      cause instanceof Error
        ? cause.message
        : typeof cause === 'object' && cause !== null && 'message' in cause
          ? String(cause.message)
          : String(cause),
  });

/** Bytes held so far across every file of the model. */
export interface DownloadProgress {
  /** Kept from earlier visits plus fetched in this load. */
  readonly loaded: number;
  readonly total: number;
  /** Bytes that came over the network in this load, for its speed. */
  readonly fetched: number;
}

/** A loaded model. Holds GPU or WASM memory until disposed. */
export interface Recognizer {
  /** Transcribes 16 kHz mono samples; words come back on the audio clock. */
  readonly transcribe: (
    samples: Float32Array,
    offset: number,
  ) => Effect.Effect<ReadonlyArray<Word>, EngineError>;
  readonly dispose: Effect.Effect<void>;
}

/** Downloads as they progress, then the loaded model once. */
export type Loading =
  | { readonly _tag: 'Downloading'; readonly progress: DownloadProgress }
  | { readonly _tag: 'Ready'; readonly recognizer: Recognizer };

/** How much of a model the browser holds, and how many bytes of it. */
export interface ModelCache {
  readonly state: 'none' | 'partial' | 'downloaded';
  readonly bytes: number;
}

export const nothingCached: ModelCache = { state: 'none', bytes: 0 };

/**
 * One speech library behind a common door. Loading may pull in the library;
 * reading and clearing the cache never does, so the page can call them.
 */
export interface SpeechEngine {
  readonly models: ReadonlyArray<SpeechModel>;
  readonly load: (model: string) => Stream.Stream<Loading, EngineError>;
  /** A cache that cannot be read counts as none. */
  readonly readCache: (model: string) => Effect.Effect<ModelCache>;
  readonly clearCache: (model: string) => Effect.Effect<void, EngineError>;
}

/** Fails fast when the browser cannot hand out a GPU. */
export const requireWebGpu: Effect.Effect<void, EngineError> =
  Effect.tryPromise({
    try: async () => {
      const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
      const adapter = gpu ? await gpu.requestAdapter() : null;
      if (!adapter) throw new Error('This browser has no WebGPU adapter.');
    },
    catch: engineFailure,
  });
