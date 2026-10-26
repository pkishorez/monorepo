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
} from 'effect';
import { inputsOf } from './inputs.ts';
import { clipOf, type Chunk } from './pcm.ts';
import { addProcessor, PROCESSOR } from './worklet.ts';

/*
 * The microphone, recorded for a Dictation: raw PCM through an
 * AudioWorklet, one channel at 16 kHz, 16-bit signed little-endian, as
 * Speech to Text takes it (ADR 0017). The whole clip is kept in memory,
 * and only the last one: recording again lets the one before go.
 *
 * 1. Open    the microphone chosen, asked of the browser, or the system
 *            default; one chosen that is not there falls back to the
 *            default, and says so. Denied, missing or broken, it says why
 *            in a sentence a person reads.
 * 2. Hear    each eighth of a second or so, the PCM is kept and how loud it
 *            was is passed on, for the meter. A microphone that goes away
 *            ends it.
 * 3. Switch  another microphone, while it records: it opens, then takes
 *            the old one's place in front of the same AudioWorklet, so the
 *            clip carries on in one piece, and the old one is let go.
 * 4. Keep    as the recording's Scope closes, the microphone and the audio
 *            are let go and the clip is whole, for `clip` to give.
 *
 * It also lists the browser's microphones to choose from (`inputs.ts`).
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

type SwitchTo = (
  microphone: string | null,
) => Effect.Effect<Heard, MicrophoneUnavailable>;

/** The browser's microphone. */
export const browser: Layer.Layer<Recorder> = Layer.effect(
  Recorder,
  Effect.gen(function* () {
    const last = yield* Ref.make(yield* Deferred.make<Uint8Array>());
    // 3. Switch: how the recording now changes microphone, while one does.
    const now = yield* Ref.make<SwitchTo | null>(null);
    return {
      record: (microphone) =>
        Effect.gen(function* () {
          const kept = yield* Deferred.make<Uint8Array>();
          yield* Ref.set(last, kept);
          const chunks: Array<Int16Array> = [];
          // 4. Keep: added first, so it runs once the audio is let go.
          yield* Effect.addFinalizer(() =>
            Deferred.succeed(kept, clipOf(chunks)),
          );
          const recording = yield* hear(chunks, microphone);
          yield* Ref.set(now, recording.switchTo);
          yield* Effect.addFinalizer(() => Ref.set(now, null));
          return { heard: recording.heard, levels: recording.levels };
        }),
      switchTo: (microphone) =>
        Effect.flatMap(Ref.get(now), (switchTo) =>
          switchTo === null ? Effect.succeed(null) : switchTo(microphone),
        ),
      clip: Effect.flatMap(Ref.get(last), Deferred.await),
      inputs: Stream.unwrap(Effect.map(media, inputsOf)).pipe(
        Stream.mapError(unavailable),
      ),
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

const unavailable = (cause: unknown) =>
  new MicrophoneUnavailable({ reason: reasonOf(cause) });

/** The browser's media devices, where the page can reach them. */
const media = Effect.suspend(() =>
  typeof navigator === 'undefined' || !navigator.mediaDevices
    ? Effect.fail(new Error('This page cannot reach a microphone'))
    : Effect.succeed(navigator.mediaDevices),
);

const constraints = (microphone: string | null): MediaStreamConstraints => ({
  audio: {
    ...(microphone === null ? {} : { deviceId: { exact: microphone } }),
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});

/** Whether the browser refused because no input has that `deviceId`. */
const isGone = (cause: unknown) =>
  cause instanceof Error &&
  (cause.name === 'OverconstrainedError' || cause.name === 'NotFoundError');

const stop = (stream: MediaStream) => {
  for (const track of stream.getTracks()) track.stop();
};

// 1. Open: the stream, not yet let go; whoever opens it stops it.
const open = (microphone: string | null) =>
  Effect.gen(function* () {
    const devices = yield* media;
    const ask = (id: string | null) =>
      Effect.tryPromise({
        try: () => devices.getUserMedia(constraints(id)),
        catch: (cause) => cause,
      });
    const chosen = yield* Effect.result(ask(microphone));
    if (chosen._tag === 'Success')
      return { stream: chosen.success, fellBack: false };
    if (microphone === null || !isGone(chosen.failure))
      return yield* Effect.fail(chosen.failure);
    return { stream: yield* ask(null), fellBack: true };
  }).pipe(Effect.mapError(unavailable));

const nameOf = (stream: MediaStream) =>
  stream.getAudioTracks()[0]?.label || 'Microphone';

const audio = Effect.acquireRelease(
  Effect.sync(() => new AudioContext()),
  (context) => Effect.promise(() => context.close().catch(() => undefined)),
);

// 2. Hear
const hear = (chunks: Array<Int16Array>, microphone: string | null) =>
  Effect.gen(function* () {
    // Stopping a track twice is nothing: the one switched to is stopped
    // below, this one here even when the audio never started.
    const first = yield* Effect.acquireRelease(open(microphone), ({ stream }) =>
      Effect.sync(() => stop(stream)),
    );
    const context = yield* audio;
    yield* Effect.tryPromise({
      try: async () => {
        await addProcessor(context);
        await context.resume();
      },
      catch: unavailable,
    });
    const levels = yield* Queue.sliding<number, Cause.Done>(1);
    const node = new AudioWorkletNode(context, PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
    node.port.onmessage = ({ data }: MessageEvent<Chunk>) => {
      chunks.push(data.samples);
      Queue.offerUnsafe(levels, data.level);
    };
    const gone = () => Queue.endUnsafe(levels);
    /** The microphone heard now, in front of the AudioWorklet. */
    const attach = (stream: MediaStream) => {
      const source = context.createMediaStreamSource(stream);
      source.connect(node);
      for (const track of stream.getAudioTracks())
        track.addEventListener('ended', gone);
      return { stream, source };
    };
    const detach = ({ stream, source }: typeof live) => {
      for (const track of stream.getAudioTracks())
        track.removeEventListener('ended', gone);
      source.disconnect();
    };
    let live = attach(first.stream);
    let closed = false;
    // Pulled by the output, which hears only silence.
    node.connect(context.destination);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true;
        node.port.onmessage = null;
        detach(live);
        stop(live.stream);
        node.disconnect();
      }),
    );
    // 3. Switch: whole or not at all, so no microphone is left open.
    const switchTo: SwitchTo = (next) =>
      Effect.uninterruptible(
        Effect.map(open(next), ({ stream, fellBack }) => {
          if (closed) {
            stop(stream);
            return { name: nameOf(live.stream), fellBack };
          }
          const old = live;
          live = attach(stream);
          detach(old);
          stop(old.stream);
          return { name: nameOf(stream), fellBack };
        }),
      );
    return {
      heard: { name: nameOf(first.stream), fellBack: first.fellBack },
      levels: Stream.fromQueue(levels),
      switchTo,
    };
  });
