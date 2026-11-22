import { type Cause, Effect, Queue, Stream } from 'effect';
import {
  type Hearing,
  type Microphones,
  recorderOver,
  unavailable,
} from '../recorder.ts';
import type { Chunk } from '../pcm.ts';
import { inputsOf } from './inputs.ts';
import { addProcessor, PROCESSOR } from './worklet.ts';

/*
 * The browser's microphones, as `Recorder` hears them (`../recorder.ts`):
 * asked of the browser, heard through an AudioWorklet (`worklet.ts`), and
 * listed from its media devices (`inputs.ts`).
 *
 * 1. Open    asked of the browser with `getUserMedia`; the error it gives
 *            becomes a sentence a person reads.
 * 2. Hear    the AudioWorklet posts each chunk and how loud it was.
 * 3. Switch  the new microphone opens, then takes the old one's place in
 *            front of the same AudioWorklet, and the old one is let go.
 */

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
const hear: Microphones['hear'] = (
  chunks: Array<Int16Array>,
  microphone: string | null,
  added: () => void,
) =>
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
      added();
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
    const switchTo: Hearing['switchTo'] = (next) =>
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
    } satisfies Hearing;
  });

/** The browser's microphone. */
export const browser = recorderOver({
  hear,
  inputs: Stream.unwrap(Effect.map(media, inputsOf)).pipe(
    Stream.mapError(unavailable),
  ),
});
