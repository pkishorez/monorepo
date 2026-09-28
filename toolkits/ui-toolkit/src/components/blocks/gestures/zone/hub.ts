import { createActor } from 'xstate';
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
import type { PointerSink } from '../touch-input';
import { type Hold, type ZoneOutput, zoneMachine } from '../zone-machine';

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
  /** Whether a still finger can become a Hold. Read as a second finger lands. */
  readonly holds?: () => boolean;
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
 * that feeds the zone machine. The machine decides the phases, and with them
 * the Hold; the hub reads the Gesture, Swipe and Tap the machine asks for and
 * hands them to each enabled listener under the same Hold. Which listeners
 * take a Gesture is fixed as it begins; which take a Swipe, as its axis is
 * fixed; which take a Tap, as it lifts.
 */
export const createHub = (options: HubOptions = {}) => {
  const gestures = new Set<GestureListener>();
  const swipes = new Set<SwipeListener>();
  const taps = new Set<TapListener>();
  let gesture = createGestureReading();
  let swipe = createSwipeReading();
  // The Hold the current Gesture is under, fixed as it begins.
  let under: Hold = 'none';
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

  const output: ZoneOutput = {
    begin: (hold, finger) => {
      gesture = createGestureReading();
      swipe = createSwipeReading();
      gesture.down(finger);
      moved = false;
      under = hold;
      gesturing = taking(gestures, under);
      warnOverlap('useGesture', gesturing.length);
      for (const listener of gesturing) listener.begin(gesture.origin());
      swipe.start(gesture.origin());
    },
    join: (finger) => {
      gesture.down(finger);
      moved = true;
      endSwipe(swipe.join(gesture.velocity(finger.t)));
    },
    move: (finger) => {
      const values = gesture.move(finger);
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
    leave: (finger) => {
      const velocity = gesture.velocity(finger.t);
      if (gesture.up(finger.id) === 'end') endGesture(velocity, false);
    },
    interrupt: () => {
      if (gesture.active()) endGesture(STILL, true);
      gesture = createGestureReading();
      swipe = createSwipeReading();
    },
  };

  const machine = createActor(zoneMachine, {
    input: { holds: options.holds ?? (() => false), output },
  }).start();

  const sink: PointerSink = {
    holding: () => machine.getSnapshot().matches('held'),
    down: (finger) => machine.send({ type: 'finger.down', finger }),
    move: (finger) => machine.send({ type: 'finger.move', finger }),
    up: (finger) => {
      // Only one finger lifting without moving, with no Hold, still clicks.
      const clicks = machine.getSnapshot().matches('pressing');
      machine.send({ type: 'finger.up', finger });
      return !clicks;
    },
    cancelAll: () => machine.send({ type: 'cancel' }),
  };

  const hold = (): Hold => machine.getSnapshot().context.hold;

  return {
    sink,
    /** The Hold on now: `none` when there is none. */
    hold,
    /** Calls `watcher` whenever the Hold changes; returns the unwatch. */
    watchHold: (watcher: () => void) => {
      let last = hold();
      const subscription = machine.subscribe(() => {
        if (hold() === last) return;
        last = hold();
        watcher();
      });
      return () => subscription.unsubscribe();
    },
    /** The machine's state now, such as `held.acting`, for debugging. */
    state: () => {
      const value = machine.getSnapshot().value;
      return typeof value === 'string'
        ? value
        : Object.entries(value)
            .map(([parent, child]) => `${parent}.${String(child)}`)
            .join();
    },
    /** Calls `watcher` on every step of the machine; returns the unwatch. */
    watch: (watcher: () => void) => {
      const subscription = machine.subscribe(watcher);
      return () => subscription.unsubscribe();
    },
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
