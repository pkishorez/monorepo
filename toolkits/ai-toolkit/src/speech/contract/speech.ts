import { Context, Data, type Effect, type Stream } from 'effect';

/*
 * Speech to Text as a program asks for it: the `Speech` key, how it
 * stands, what a Take has heard, and how it fails. Its Node layer, over
 * a folder and a SpeechToText, is `../speech.ts`.
 */

/** What a Take has heard so far. */
export type TakeHeard =
  /** The model is downloading: bytes of `total`, once known. */
  | {
      readonly _tag: 'Downloading';
      readonly done: number;
      readonly total: number | null;
    }
  /** The text so far; more may come. */
  | { readonly _tag: 'Heard'; readonly text: string }
  /** The whole text: nothing more comes. */
  | { readonly _tag: 'Done'; readonly text: string };

/** Speech to Text is not ready on this Connection: off, still downloading, or failed. */
export class SpeechToTextNotReady extends Data.TaggedError(
  'SpeechToTextNotReady',
)<{
  readonly state: 'Off' | 'Downloading' | 'Failed';
}> {}

/** The model would not load, or could not make out the audio. */
export class TranscriptionFailed extends Data.TaggedError(
  'TranscriptionFailed',
)<{
  readonly message: string;
}> {}

/** How Speech to Text stands on this Connection. */
export type SpeechToTextStatus =
  | { readonly _tag: 'Off' }
  /** Bytes of the model downloaded, of `total` once the server says it. */
  | {
      readonly _tag: 'Downloading';
      readonly done: number;
      readonly total: number | null;
    }
  | { readonly _tag: 'Ready' }
  /** Enabling again tries again. */
  | { readonly _tag: 'Failed'; readonly reason: string };

export interface SpeechService {
  /** Switches it on, at once; the model downloads after, unless it is there. */
  readonly enable: Effect.Effect<void>;
  /** Switches it off, deleting the model. */
  readonly disable: Effect.Effect<void>;
  /** How it stands now, then each change. */
  readonly watch: Stream.Stream<SpeechToTextStatus>;
  /** The text spoken in 16 kHz mono PCM, each sample 16-bit signed little-endian. */
  readonly transcribe: (
    pcm: Uint8Array,
  ) => Effect.Effect<string, SpeechToTextNotReady | TranscriptionFailed>;
  /**
   * What Take `id`, a Dictation sent as it is recorded, has heard now,
   * then each change, ending with Done. Speech to Text off, it is
   * switched on, and the download's progress comes first. A Take watched
   * is never dropped; one dropped or broken before Done fails its
   * watchers.
   */
  readonly watchTake: (
    id: string,
  ) => Stream.Stream<TakeHeard, TranscriptionFailed>;
  /** Stretch `at`, from 0, of Take `id`: 16 kHz mono PCM, as `transcribe` takes. */
  readonly addTakeAudio: (
    id: string,
    at: number,
    pcm: Uint8Array,
  ) => Effect.Effect<void, TranscriptionFailed>;
  /** Take `id` has `count` stretches; once all are in, it is Done. */
  readonly endTake: (
    id: string,
    count: number,
  ) => Effect.Effect<void, TranscriptionFailed>;
}

export class Speech extends Context.Service<Speech, SpeechService>()(
  '@kestack/ai-toolkit/Speech',
) {}
