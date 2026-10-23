import { Context, Data, type Effect } from 'effect';

/*
 * Speech to Text: 16 kHz mono audio in, text out, on this Machine. A model
 * lives in a folder: fetched into it once, then loaded from it. The
 * implementation says which model and where it comes from; what decides
 * when to fetch, load and delete it is the speech tree's.
 */

/** The rate every sample handed to a Recognizer is at. */
export const SAMPLE_RATE = 16_000;

export class SpeechToTextError extends Data.TaggedError('SpeechToTextError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** How much of the model has arrived: bytes, of `total` when it is known. */
export interface Fetched {
  readonly done: number;
  readonly total: number | null;
}

/** A model loaded into memory. */
export interface Recognizer {
  /** The text spoken in mono samples at SAMPLE_RATE, each in [-1, 1]. */
  readonly transcribe: (
    samples: Float32Array,
  ) => Effect.Effect<string, SpeechToTextError>;
}

export class SpeechToText extends Context.Service<
  SpeechToText,
  {
    /** Whether every file of the model is in `folder`. */
    readonly installed: (folder: string) => Effect.Effect<boolean>;
    /**
     * Fetches the model into `folder`, carrying on from what an earlier,
     * cut-off fetch left there, and reports each part as it arrives.
     */
    readonly install: (
      folder: string,
      progress: (fetched: Fetched) => Effect.Effect<void>,
    ) => Effect.Effect<void, SpeechToTextError>;
    /** The model in `folder`, loaded. */
    readonly load: (
      folder: string,
    ) => Effect.Effect<Recognizer, SpeechToTextError>;
  }
>()('@kestack/ai-toolkit/SpeechToText') {}
