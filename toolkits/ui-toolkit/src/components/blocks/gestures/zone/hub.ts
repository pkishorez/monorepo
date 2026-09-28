import {
  createGestureReading,
  type GestureValues,
  type Point,
} from '../gesture-reading';
import {
  AXIS_LOCK_PX,
  type Axis,
  createSwipeReading,
  type SwipeEnd,
} from '../swipe-reading';
import type { PointerSample, PointerSink } from '../touch-input';

/**
 * A finished Gesture: its final values, where it started in viewport px, and
 * how fast each value was changing, per second. `interrupted` when the
 * browser took the touch or the page lost focus, rather than the last finger
 * lifting.
 */
export type GestureEnd = GestureValues & {
  readonly origin: Point;
  readonly velocity: GestureValues;
  readonly interrupted: boolean;
};

export type GestureListener = {
  readonly enabled: () => boolean;
  readonly begin: (origin: Point) => void;
  readonly update: (values: GestureValues) => void;
  readonly finish: (end: GestureEnd) => void;
};

export type SwipeListener = {
  readonly enabled: () => boolean;
  /** The one axis it listens on, or none for either. */
  readonly axis: () => Axis | undefined;
  readonly begin: (axis: Axis) => void;
  readonly update: (axis: Axis, distance: number) => void;
  readonly finish: (end: SwipeEnd) => void;
};

const STILL: GestureValues = { x: 0, y: 0, scale: 0, rotation: 0 };

const DEV =
  (import.meta as { readonly env?: { readonly DEV?: boolean } }).env?.DEV ===
  true;

const warnOverlap = (kind: string, count: number) => {
  if (DEV && count > 1) {
    console.warn(
      `GestureZone: ${count} enabled ${kind} listeners took the same Gesture. Disable the ones your app's state does not want right now.`,
    );
  }
};

/**
 * The zone's hub: every listener the hooks register, and the pointer sink
 * that reads the Gesture and the Swipe from the fingers and hands them to
 * each enabled listener. Which listeners take a Gesture is fixed as it
 * starts; which take a Swipe, as its axis is fixed.
 */
export const createHub = () => {
  const gestures = new Set<GestureListener>();
  const swipes = new Set<SwipeListener>();
  let gesture = createGestureReading();
  let swipe = createSwipeReading();
  let gesturing: ReadonlyArray<GestureListener> = [];
  let swiping: ReadonlyArray<SwipeListener> = [];
  // Whether the Gesture did more than a Tap: moved or had two fingers.
  let moved = false;

  const endSwipe = (end: SwipeEnd | undefined) => {
    if (end !== undefined) for (const listener of swiping) listener.finish(end);
    swiping = [];
  };

  const endGesture = (velocity: GestureValues, interrupted: boolean) => {
    endSwipe(swipe.end(velocity, interrupted));
    const end = {
      ...gesture.values(),
      origin: gesture.origin(),
      velocity,
      interrupted,
    };
    for (const listener of gesturing) listener.finish(end);
    gesturing = [];
  };

  const startSwipe = (axis: Axis) => {
    swiping = [...swipes].filter((listener) => {
      const wanted = listener.axis();
      return listener.enabled() && (wanted === undefined || wanted === axis);
    });
    warnOverlap('useSwipe', swiping.length);
    for (const listener of swiping) listener.begin(axis);
  };

  const sink: PointerSink = {
    down: (sample: PointerSample) => {
      if (gesture.down(sample) === 'start') {
        moved = false;
        gesturing = [...gestures].filter((listener) => listener.enabled());
        warnOverlap('useGesture', gesturing.length);
        for (const listener of gesturing) listener.begin(gesture.origin());
        swipe.start(gesture.origin());
        return;
      }
      moved = true;
      endSwipe(swipe.join(gesture.velocity(sample.t)));
    },
    move: (sample: PointerSample) => {
      const values = gesture.move(sample);
      if (values === undefined) return;
      if (Math.max(Math.abs(values.x), Math.abs(values.y)) >= AXIS_LOCK_PX) {
        moved = true;
      }
      for (const listener of gesturing) listener.update(values);
      const step = swipe.move(values);
      if (step === undefined) return;
      if (step.started) startSwipe(step.axis);
      for (const listener of swiping) listener.update(step.axis, step.distance);
    },
    up: (sample: PointerSample) => {
      const velocity = gesture.velocity(sample.t);
      if (gesture.up(sample.id) === 'end') endGesture(velocity, false);
      return moved;
    },
    cancelAll: () => {
      if (gesture.active()) endGesture(STILL, true);
      gesture = createGestureReading();
      swipe = createSwipeReading();
    },
  };

  return {
    sink,
    addGesture: (listener: GestureListener) => {
      gestures.add(listener);
      return () => {
        gestures.delete(listener);
        gesturing = gesturing.filter((other) => other !== listener);
      };
    },
    addSwipe: (listener: SwipeListener) => {
      swipes.add(listener);
      return () => {
        swipes.delete(listener);
        swiping = swiping.filter((other) => other !== listener);
      };
    },
  };
};

export type Hub = ReturnType<typeof createHub>;
