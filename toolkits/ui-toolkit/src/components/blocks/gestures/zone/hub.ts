import {
  createGestureReading,
  type GestureValues,
  type Point,
} from '../gesture-reading';
import { createHoldReading, type Hold, type Side } from '../hold-reading';
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

/** A Tap: where the finger touched, in viewport px. */
export type Tap = { readonly point: Point };

type Listener = {
  readonly enabled: () => boolean;
  /** The one Hold it takes Gestures under. */
  readonly hold: () => Hold;
};

export type GestureListener = Listener & {
  readonly begin: (origin: Point) => void;
  readonly update: (values: GestureValues) => void;
  readonly finish: (end: GestureEnd) => void;
};

export type SwipeListener = Listener & {
  /** The one axis it listens on, or none for either. */
  readonly axis: () => Axis | undefined;
  readonly begin: (axis: Axis) => void;
  readonly update: (axis: Axis, distance: number) => void;
  readonly finish: (end: SwipeEnd) => void;
};

export type TapListener = Listener & {
  readonly tap: (tap: Tap) => void;
};

export type HubOptions = {
  /** The Hold Zone a point in viewport px lands in, if any. */
  readonly holdAt?: (point: Point) => Side | undefined;
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

const taking = <T extends Listener>(listeners: Set<T>, hold: Hold) =>
  [...listeners].filter(
    (listener) => listener.enabled() && listener.hold() === hold,
  );

const register = <T>(listeners: Set<T>, listener: T, drop: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    drop();
  };
};

/**
 * The zone's hub: every listener the hooks register, and the pointer sink
 * that reads the Hold, the Gesture, the Swipe and the Tap from the fingers
 * and hands them to each enabled listener under the same Hold. Which
 * listeners take a Gesture is fixed as it starts; which take a Swipe, as its
 * axis is fixed; which take a Tap, as it lands.
 */
export const createHub = (options: HubOptions = {}) => {
  const gestures = new Set<GestureListener>();
  const swipes = new Set<SwipeListener>();
  const taps = new Set<TapListener>();
  const holdWatchers = new Set<() => void>();
  const holds = createHoldReading();
  let gesture = createGestureReading();
  let swipe = createSwipeReading();
  // The Hold the current Gesture is under, fixed as it starts.
  let under: Hold = 'none';
  let gesturing: ReadonlyArray<GestureListener> = [];
  let swiping: ReadonlyArray<SwipeListener> = [];
  // Whether the Gesture did more than a Tap: moved or had two fingers.
  let moved = false;

  const tellHold = () => {
    for (const watcher of holdWatchers) watcher();
  };

  const endSwipe = (end: SwipeEnd | undefined) => {
    if (end !== undefined) for (const listener of swiping) listener.finish(end);
    swiping = [];
  };

  const endGesture = (velocity: GestureValues, interrupted: boolean) => {
    endSwipe(swipe.end(velocity, interrupted));
    const origin = gesture.origin();
    const end = { ...gesture.values(), origin, velocity, interrupted };
    for (const listener of gesturing) listener.finish(end);
    gesturing = [];
    if (moved || interrupted) return;
    const tapping = taking(taps, under);
    warnOverlap('useTap', tapping.length);
    for (const listener of tapping) listener.tap({ point: origin });
  };

  const startSwipe = (axis: Axis) => {
    swiping = taking(swipes, under).filter((listener) => {
      const wanted = listener.axis();
      return wanted === undefined || wanted === axis;
    });
    warnOverlap('useSwipe', swiping.length);
    for (const listener of swiping) listener.begin(axis);
  };

  const sink: PointerSink = {
    holding: () => holds.hold() !== 'none',
    down: (sample: PointerSample) => {
      const landing = holds.down(sample, options.holdAt?.(sample));
      if (landing === 'aside') return;
      if (landing === 'held') {
        // The corner finger's Gesture was only waiting to see: it ends, and
        // this finger starts a new one under the Hold.
        if (gesture.active()) endGesture(STILL, true);
        gesture = createGestureReading();
        swipe = createSwipeReading();
        tellHold();
      }
      if (gesture.down(sample) === 'start') {
        moved = false;
        under = holds.hold();
        gesturing = taking(gestures, under);
        warnOverlap('useGesture', gesturing.length);
        for (const listener of gesturing) listener.begin(gesture.origin());
        swipe.start(gesture.origin());
        return;
      }
      moved = true;
      endSwipe(swipe.join(gesture.velocity(sample.t)));
    },
    move: (sample: PointerSample) => {
      holds.move(sample);
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
      const { finger, released } = holds.up(sample.id);
      // Only a Gesture's own fingers, with no Hold, may still click.
      let swallow = !finger || under !== 'none';
      if (finger) {
        const velocity = gesture.velocity(sample.t);
        if (gesture.up(sample.id) === 'end') endGesture(velocity, false);
        swallow ||= moved;
      }
      if (released) tellHold();
      return swallow;
    },
    cancelAll: () => {
      if (gesture.active()) endGesture(STILL, true);
      gesture = createGestureReading();
      swipe = createSwipeReading();
      const held = holds.hold() !== 'none';
      holds.reset();
      if (held) tellHold();
    },
  };

  return {
    sink,
    /** The Hold on now: `none` when there is none. */
    hold: (): Hold => holds.hold(),
    watchHold: (watcher: () => void) =>
      register(holdWatchers, watcher, () => undefined),
    addGesture: (listener: GestureListener) =>
      register(gestures, listener, () => {
        gesturing = gesturing.filter((other) => other !== listener);
      }),
    addSwipe: (listener: SwipeListener) =>
      register(swipes, listener, () => {
        swiping = swiping.filter((other) => other !== listener);
      }),
    addTap: (listener: TapListener) =>
      register(taps, listener, () => undefined),
  };
};

export type Hub = ReturnType<typeof createHub>;
