import { Cause, Effect, Layer, Queue, Stream } from 'effect';
import type {
  GestureRecognizer,
  GestureRecognizerResult,
} from '@mediapipe/tasks-vision';
import wasmLoader from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinary from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { Interpreter } from '../../shared/gestures/index.ts';
import type {
  Fired,
  Frame,
  Options,
  Reading,
} from '../../shared/gestures/index.ts';
import { Tracker, TrackerError } from '../../shared/tracker/index.ts';
import type { Delegate, Signal } from '../../shared/tracker/index.ts';

/*
 * The browser's Tracker: the camera, MediaPipe's Gesture Recognizer and
 * the Interpreter, one frame at a time. The model runs on the GPU, or on
 * the CPU where the GPU will not start, from WASM this site serves itself;
 * it is loaded once and kept, so turning the camera off and on again is
 * quick. Each frame is read when the video has a new one, on the main
 * thread, and its reading is published to the stage here, outside the
 * app's Messages; only the gestures fired go into the Tracker's Stream.
 */

/** Google's Gesture Recognizer: the hand landmarker plus a shape classifier. */
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

export interface Snapshot {
  readonly video: HTMLVideoElement;
  readonly reading: Reading;
  /** The gestures fired on this frame. */
  readonly fired: ReadonlyArray<Fired>;
  readonly delegate: Delegate;
  /** Frames read a second, averaged. */
  readonly fps: number;
  /** How long the model took on this frame, in ms, averaged. */
  readonly ms: number;
}

let options: Options = { smoothing: true };
let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

const publish = (next: Snapshot | null) => {
  snapshot = next;
  for (const listener of listeners) listener();
};

/** The latest frame's snapshot, or `null` while the camera is off. */
export const latest = () => snapshot;

/** Calls `listener` after every frame read, and once when the camera goes off. */
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const cameraReason = (error: unknown) => {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError')
    return 'Camera access was refused. Allow it from the address bar, then start again.';
  if (name === 'NotFoundError') return 'No camera was found.';
  if (name === 'NotReadableError')
    return 'The camera is busy: another app or tab may be using it.';
  return `The camera would not open: ${error instanceof Error ? error.message : String(error)}`;
};

const openCamera = Effect.acquireRelease(
  Effect.tryPromise({
    try: () => {
      if (navigator.mediaDevices?.getUserMedia === undefined)
        throw new Error('this page needs HTTPS or localhost to use the camera');
      return navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });
    },
    catch: (error) => new TrackerError({ reason: cameraReason(error) }),
  }),
  (stream) =>
    Effect.sync(() => stream.getTracks().forEach((track) => track.stop())),
);

/** A video playing the camera, kept in the page but out of sight, as Safari wants. */
const openVideo = (stream: MediaStream) =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        video.style.cssText =
          'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
        document.body.appendChild(video);
        await video.play();
        return video;
      },
      catch: (error) => new TrackerError({ reason: cameraReason(error) }),
    }),
    (video) =>
      Effect.sync(() => {
        video.srcObject = null;
        video.remove();
      }),
  );

let model: Promise<{
  recognizer: GestureRecognizer;
  delegate: Delegate;
}> | null = null;

const loadModel = Effect.tryPromise({
  try: () => {
    model ??= (async () => {
      const { GestureRecognizer } = await import('@mediapipe/tasks-vision');
      const make = (delegate: Delegate) =>
        GestureRecognizer.createFromOptions(
          { wasmLoaderPath: wasmLoader, wasmBinaryPath: wasmBinary },
          {
            baseOptions: { modelAssetPath: MODEL, delegate },
            runningMode: 'VIDEO',
            numHands: 2,
          },
        );
      try {
        return { recognizer: await make('GPU'), delegate: 'GPU' as const };
      } catch {
        return { recognizer: await make('CPU'), delegate: 'CPU' as const };
      }
    })();
    return model.catch((error: unknown) => {
      model = null;
      throw error;
    });
  },
  catch: (error) =>
    new TrackerError({
      reason: `The model would not load: ${error instanceof Error ? error.message : String(error)}`,
    }),
});

const frameOf = (
  result: GestureRecognizerResult,
  at: number,
  aspect: number,
): Frame => ({
  at,
  aspect,
  hands: result.landmarks.map((points, i) => ({
    points,
    world: result.worldLandmarks[i] ?? points,
    handedness: {
      label: result.handedness[i]?.[0]?.categoryName ?? '?',
      score: result.handedness[i]?.[0]?.score ?? 0,
    },
    shape: {
      name: result.gestures[i]?.[0]?.categoryName ?? 'None',
      score: result.gestures[i]?.[0]?.score ?? 0,
    },
  })),
});

/** Moves an average a tenth of the way toward each new value. */
const average = (old: number, value: number) =>
  old === 0 ? value : old * 0.9 + value * 0.1;

const track = Stream.callback<Signal, TrackerError>(
  (queue) =>
    Effect.gen(function* () {
      const stream = yield* openCamera;
      const video = yield* openVideo(stream);
      Queue.offerUnsafe(queue, { _tag: 'Loading' });
      const { recognizer, delegate } = yield* loadModel;
      Queue.offerUnsafe(queue, { _tag: 'Ready', delegate });

      const interpreter = new Interpreter();
      let stopped = false;
      let frameHandle = 0;
      let lastVideoTime = -1;
      let lastAt = 0;
      let fps = 0;
      let ms = 0;

      const read = () => {
        if (stopped) return;
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const at = performance.now();
          try {
            const result = recognizer.recognizeForVideo(video, at);
            ms = average(ms, performance.now() - at);
            if (lastAt > 0) fps = average(fps, 1000 / (at - lastAt));
            lastAt = at;
            const aspect = video.videoWidth / video.videoHeight || 16 / 9;
            const step = interpreter.step(frameOf(result, at, aspect), options);
            publish({ video, ...step, delegate, fps, ms });
            for (const fired of step.fired)
              Queue.offerUnsafe(queue, { _tag: 'Fired', fired });
          } catch (error) {
            stopped = true;
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new TrackerError({
                  reason: `The model stopped: ${error instanceof Error ? error.message : String(error)}`,
                }),
              ),
            );
            return;
          }
        }
        frameHandle = requestAnimationFrame(read);
      };
      frameHandle = requestAnimationFrame(read);

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          stopped = true;
          cancelAnimationFrame(frameHandle);
          publish(null);
        }),
      );
      return yield* Effect.never;
    }),
  { bufferSize: 256 },
);

/** The Tracker the Playground Requires, for the browser's Layer. */
export const layer = Layer.succeed(Tracker, {
  track,
  configure: (next) =>
    Effect.sync(() => {
      options = next;
    }),
});
