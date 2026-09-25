/**
 * Opens the microphone at 16 kHz mono and owns the session's audio clock.
 * The capture lives in the scope it was opened in; pausing freezes the clock.
 */
import { Context, Effect, Layer, Schema, type Scope } from 'effect';
import captureWorkletUrl from './capture.worklet.ts?worker&url';
import { Recording } from './recording.ts';

export const sampleRate = 16000;

export class MicrophoneError extends Schema.TaggedError<MicrophoneError>()(
  'MicrophoneError',
  {
    reason: Schema.Literals(['denied', 'unavailable']),
    message: Schema.String,
  },
) {}

export interface Capture {
  /** Seconds of audio captured so far: the audio clock. */
  readonly now: Effect.Effect<number>;
  /** Samples between two audio-clock times. */
  readonly window: (
    from: number,
    to: number,
  ) => Effect.Effect<Float32Array<ArrayBuffer>>;
  /** Stops the microphone; the clock no longer advances. */
  readonly pause: Effect.Effect<void>;
}

export interface MicrophoneService {
  /** Opens the microphone for the life of the scope. */
  readonly capture: Effect.Effect<Capture, MicrophoneError, Scope.Scope>;
}

const toMicrophoneError = (cause: unknown): MicrophoneError => {
  const name = cause instanceof Error ? cause.name : '';
  const denied = name === 'NotAllowedError' || name === 'SecurityError';
  return new MicrophoneError({
    reason: denied ? 'denied' : 'unavailable',
    message: cause instanceof Error ? cause.message : String(cause),
  });
};

const openCapture = Effect.gen(function* () {
  const stream = yield* Effect.tryPromise({
    try: () =>
      navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      }),
    catch: toMicrophoneError,
  });
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => stream.getTracks().forEach((track) => track.stop())),
  );

  const context = yield* Effect.tryPromise({
    try: async () => {
      const context = new AudioContext({ sampleRate });
      await context.audioWorklet.addModule(captureWorkletUrl);
      // iOS Safari starts a context made outside a tap suspended; the clock would never move.
      await context.resume();
      return context;
    },
    catch: toMicrophoneError,
  });
  yield* Effect.addFinalizer(() => Effect.promise(() => context.close()));

  const recording = new Recording(context.sampleRate);
  const node = new AudioWorkletNode(context, 'stt-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
  });
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    recording.append(event.data);
  };
  context.createMediaStreamSource(stream).connect(node);

  const capture: Capture = {
    now: Effect.sync(() => recording.seconds),
    window: (from, to) => Effect.sync(() => recording.window(from, to)),
    pause: Effect.sync(() => {
      stream.getTracks().forEach((track) => track.stop());
      node.disconnect();
    }),
  };
  return capture;
});

export class Microphone extends Context.Service<
  Microphone,
  MicrophoneService
>()('stt/Microphone') {
  static readonly layer: Layer.Layer<Microphone> = Layer.succeed(Microphone, {
    capture: openCapture,
  });
}
