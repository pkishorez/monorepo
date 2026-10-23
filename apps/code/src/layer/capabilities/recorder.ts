import { Context, Data } from 'effect';
import type { Effect, Scope, Stream } from 'effect';

/*
 * The microphone, recorded for a Dictation: raw PCM, one channel at
 * 16 kHz, 16-bit signed little-endian, as Speech to Text takes it
 * (ADR 0017). Only the last clip is kept. The app Layer gives it, from
 * `services/recorder/`.
 */

/** One audio input: the browser's `deviceId` and its name; `null` for the system default. */
export interface Input {
  readonly deviceId: string | null;
  readonly label: string;
}

/** Why the microphone could not be recorded, as a person reads it. */
export class MicrophoneUnavailable extends Data.TaggedError(
  'MicrophoneUnavailable',
)<{ readonly reason: string }> {}

/**
 * The microphone a recording hears: its name, and whether the one chosen
 * was not there, so the system default is heard instead.
 */
export interface Heard {
  readonly name: string;
  readonly fellBack: boolean;
}

/** The microphone, for the Dictation. */
export class Recorder extends Context.Service<
  Recorder,
  {
    /**
     * Records from `microphone`, a `deviceId`, or the system default for
     * null, for as long as the Scope lasts: the microphone heard, and how
     * loud each moment is, 0 to 1, ending if the microphone goes away. Its
     * clip is kept once the Scope closes, in place of the last one.
     */
    readonly record: (microphone: string | null) => Effect.Effect<
      {
        readonly heard: Heard;
        readonly levels: Stream.Stream<number>;
      },
      MicrophoneUnavailable,
      Scope.Scope
    >;
    /**
     * Records the rest of the recording now from `microphone`, into the
     * same clip; null when nothing records. Failing, the old one carries on.
     */
    readonly switchTo: (
      microphone: string | null,
    ) => Effect.Effect<Heard | null, MicrophoneUnavailable>;
    /** The last clip, once its recording has ended; waits until then. */
    readonly clip: Effect.Effect<Uint8Array>;
    /**
     * The browser's microphones, the system default first, now and on each
     * change; it asks to use one first, so they are named.
     */
    readonly inputs: Stream.Stream<ReadonlyArray<Input>, MicrophoneUnavailable>;
  }
>()('code/Recorder') {}
