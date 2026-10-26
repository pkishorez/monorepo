import { Context, type Effect } from 'effect';

/*
 * What the speech model stands on, so it can be run against a fake: the
 * wish and the model's files in the Connection's data folder, and the model
 * once loaded. speech.ts builds it from SpeechToText. Failures are the
 * message to show.
 */

/** How much of the model has arrived: bytes, of `total` when it is known. */
export interface Fetched {
  readonly done: number;
  readonly total: number | null;
}

export class SpeechHost extends Context.Service<
  SpeechHost,
  {
    /** Whether the wish is kept: Speech to Text was switched on. */
    readonly wished: Effect.Effect<boolean>;
    /** Whether every file of the model is on disk. */
    readonly installed: Effect.Effect<boolean>;
    /** Keeps the wish, then fetches the model, carrying on from what is on disk. */
    readonly install: (
      progress: (fetched: Fetched) => Effect.Effect<void>,
    ) => Effect.Effect<void, string>;
    /** The text spoken in 16 kHz mono samples; the model is loaded on first use and kept. */
    readonly transcribe: (
      samples: Float32Array,
    ) => Effect.Effect<string, string>;
    /** Forgets the loaded model, and deletes its files and the wish. */
    readonly remove: Effect.Effect<void>;
  }
>()('@kestack/ai-toolkit/speech/SpeechHost') {}
