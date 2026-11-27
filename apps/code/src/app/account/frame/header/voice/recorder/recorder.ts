import {
  Cause,
  Context,
  Data,
  Deferred,
  Effect,
  Layer,
  Queue,
  Ref,
  type Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { clipOf } from './pcm.ts';

/*
 * The microphone, recorded for a Dictation: raw PCM, one channel at 16
 * kHz, 16-bit signed little-endian, as Speech to Text takes it (ADR 0017).
 * The whole clip is kept in memory, and only the last one: recording again
 * lets the one before go. `Recorder` is the key; the page's root Layer
 * gives it, over the browser's microphones (`browser/`) or, in fake mode,
 * the Microphone fake's (`fake/`), each a `Microphones`, the edge:
 *
 * 1. Open    the microphone chosen, or the system default; one chosen that
 *            is not there falls back to the default, and says so. Denied,
 *            missing or broken, it says why in a sentence a person reads
 *            (`unavailable`).
 * 2. Hear    each eighth of a second or so, the PCM is kept and how loud it
 *            was is passed on, for the meter. A microphone that goes away
 *            ends it.
 * 3. Switch  another microphone, while it records: the clip carries on in
 *            one piece, and the old one is let go.
 * 4. Keep    as the recording's Scope closes, the microphone and the audio
 *            are let go and the clip is whole, for `clip` to give. While
 *            it records, and after, `audio` gives it as it comes
 *            (`recorderOver`, the same over either).
 *
 * It also lists the microphones to choose from.
 */

/** One audio input: the browser's `deviceId` and its name; `null` for the system default. */
export interface Input {
  readonly deviceId: string | null;
  readonly label: string;
}

/**
 * Why the microphone could not be recorded, as a person reads it; `blocked`
 * when the browser refused it, as iOS Safari at times does on its own
 * until the page is loaded again.
 */
export class MicrophoneUnavailable extends Data.TaggedError(
  'MicrophoneUnavailable',
)<{ readonly reason: string; readonly blocked?: boolean }> {}

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
     * The last recording's audio, in chunks as the clip keeps them: those
     * kept so far at once, then each as it comes, ending as it ends.
     */
    readonly audio: Stream.Stream<Int16Array>;
    /**
     * The browser's microphones, the system default first, now and on each
     * change; it asks to use one first, so they are named.
     */
    readonly inputs: Stream.Stream<ReadonlyArray<Input>, MicrophoneUnavailable>;
  }
>()('code/Recorder') {}

/** One recording's chunks, kept in order, and how far it has come. */
interface Tape {
  readonly chunks: Array<Int16Array>;
  readonly now: SubscriptionRef.SubscriptionRef<{
    readonly count: number;
    readonly ended: boolean;
  }>;
}

/** Each chunk of `tape`, from the first, until it ends. */
const played = ({ chunks, now }: Tape) => {
  let sent = 0;
  return SubscriptionRef.changes(now).pipe(
    Stream.takeUntil(({ ended }) => ended),
    Stream.map(({ count }) => {
      const next = chunks.slice(sent, count);
      sent = Math.max(sent, count);
      return next;
    }),
    Stream.flattenIterable,
  );
};

/** Moves the recording to `microphone`, into the same clip. */
type SwitchTo = (
  microphone: string | null,
) => Effect.Effect<Heard, MicrophoneUnavailable>;

/** One recording, open: the microphone heard, how loud each moment is, and how to switch. */
export interface Hearing {
  readonly heard: Heard;
  readonly levels: Stream.Stream<number>;
  readonly switchTo: SwitchTo;
}

/** The edge: the microphones of the browser, or of the Microphone fake. */
export interface Microphones {
  /**
   * 1. Open, 2. Hear, 3. Switch: opens `microphone`, or the system default
   * for null, and pushes each chunk it hears to `chunks`, calling `added`
   * after each, until the Scope closes.
   */
  readonly hear: (
    chunks: Array<Int16Array>,
    microphone: string | null,
    added: () => void,
  ) => Effect.Effect<Hearing, MicrophoneUnavailable, Scope.Scope>;
  /** The microphones, the system default first, now and on each change; named once allowed. */
  readonly inputs: Stream.Stream<ReadonlyArray<Input>, MicrophoneUnavailable>;
}

/** `Recorder` over `microphones`: 4. Keep, the clip and its audio. */
export const recorderOver = (microphones: Microphones): Layer.Layer<Recorder> =>
  Layer.effect(
    Recorder,
    Effect.gen(function* () {
      const last = yield* Ref.make(yield* Deferred.make<Uint8Array>());
      const tape = yield* Ref.make<Tape>({
        chunks: [],
        now: yield* SubscriptionRef.make({ count: 0, ended: true }),
      });
      // 3. Switch: how the recording now changes microphone, while one does.
      const now = yield* Ref.make<SwitchTo | null>(null);
      return {
        record: (microphone) =>
          Effect.gen(function* () {
            const kept = yield* Deferred.make<Uint8Array>();
            yield* Ref.set(last, kept);
            const chunks: Array<Int16Array> = [];
            const taped = yield* SubscriptionRef.make({
              count: 0,
              ended: false,
            });
            yield* Ref.set(tape, { chunks, now: taped });
            // 4. Keep: added first, so it runs once the audio is let go.
            yield* Effect.addFinalizer(() =>
              Effect.andThen(
                Deferred.succeed(kept, clipOf(chunks)),
                SubscriptionRef.set(taped, {
                  count: chunks.length,
                  ended: true,
                }),
              ),
            );
            const recording = yield* microphones.hear(chunks, microphone, () =>
              Effect.runSync(
                SubscriptionRef.set(taped, {
                  count: chunks.length,
                  ended: false,
                }),
              ),
            );
            yield* Ref.set(now, recording.switchTo);
            yield* Effect.addFinalizer(() => Ref.set(now, null));
            return { heard: recording.heard, levels: recording.levels };
          }),
        switchTo: (microphone) =>
          Effect.flatMap(Ref.get(now), (switchTo) =>
            switchTo === null ? Effect.succeed(null) : switchTo(microphone),
          ),
        clip: Effect.flatMap(Ref.get(last), Deferred.await),
        audio: Stream.unwrap(Effect.map(Ref.get(tape), played)),
        inputs: microphones.inputs,
      };
    }),
  );

const reasonOf = (cause: unknown) => {
  const name = cause instanceof Error ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'The microphone is blocked for this site';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No microphone found';
  if (name === 'NotReadableError')
    return 'The microphone is in use by something else';
  return `Couldn't open the microphone${cause instanceof Error && cause.message ? `: ${cause.message}` : ''}`;
};

/** Whether the browser refused the microphone, rather than lacked one. */
const isBlocked = (cause: unknown) =>
  cause instanceof Error &&
  (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');

/** Why the microphone could not be opened, from the browser's error, as a person reads it. */
export const unavailable = (cause: unknown) =>
  new MicrophoneUnavailable({
    reason: reasonOf(cause),
    blocked: isBlocked(cause),
  });
