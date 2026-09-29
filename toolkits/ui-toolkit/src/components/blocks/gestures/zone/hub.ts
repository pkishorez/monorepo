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

/**
 * A finished Pan: how far the finger moved in px, where it started in
 * viewport px, and its speed in px per second. `interrupted` when a second
 * finger landed or the browser took the touch.
 */
export type PanEnd = {
  readonly x: number;
  readonly y: number;
  readonly origin: Point;
  readonly velocity: Point;
  readonly interrupted: boolean;
};

/** A Tap: where the finger touched, in viewport px. */
export type Tap = { readonly point: Point };

/**
 * Where the Hold is: `off`; `armed`, a finger in the Hold Zone that starts
 * it when another lands; `pressing`, a finger in the Hold Zone that starts
 * it if it stays still; or `on`.
 */
export type HoldPhase = 'off' | 'armed' | 'pressing' | 'on';

type Listener = {
  readonly enabled: () => boolean;
  /** Whether it takes Gestures under the Hold, rather than with none. */
  readonly hold: () => Hold;
};

export type GestureListener = Listener & {
  readonly begin: (origin: Point) => void;
  readonly update: (values: GestureValues) => void;
  readonly finish: (end: GestureEnd) => void;
};

export type PanListener = Listener & {
  readonly begin: (origin: Point) => void;
  readonly update: (x: number, y: number) => void;
  readonly finish: (end: PanEnd) => void;
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
  /** Whether a point in viewport px is in the Hold Zone. None by default. */
  readonly inHoldZone?: (point: Point) => boolean;
  /** The Hold came on; `pressed` when it took a press. */
  readonly onHold?: (pressed: boolean) => void;
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
 * the Hold; the hub reads the Gesture, Pan, Swipe and Tap the machine asks
 * for and hands them to each enabled listener under the same Hold. Which
 * listeners take a Gesture or Pan is fixed as it begins; which take a Swipe,
 * as its axis is fixed; which take a Tap, as it lifts.
 */
export const createHub = (options: HubOptions = {}) => {
  const gestures = new Set<GestureListener>();
  const pans = new Set<PanListener>();
  const swipes = new Set<SwipeListener>();
  const taps = new Set<TapListener>();
  let gesture = createGestureReading();
  let swipe = createSwipeReading();
  // Whether the current Gesture is under the Hold, fixed as it begins.
  let under: Hold = false;
  let gesturing: ReadonlyArray<GestureListener> = [];
  let panning: ReadonlyArray<PanListener> = [];
  let swiping: ReadonlyArray<SwipeListener> = [];
  // Whether the Gesture did more than a Tap: moved or had two fingers.
  let moved = false;

  const endSwipe = (end: SwipeEnd | undefined) => {
    if (end !== undefined) for (const listener of swiping) listener.finish(end);
    swiping = [];
  };

  const endPan = (velocity: GestureValues, interrupted: boolean) => {
    const { x, y } = gesture.values();
    const end: PanEnd = {
      x,
      y,
      origin: gesture.origin(),
      velocity: { x: velocity.x, y: velocity.y },
      interrupted,
    };
    for (const listener of panning) listener.finish(end);
    panning = [];
  };

  const endGesture = (velocity: GestureValues, interrupted: boolean) => {
    endSwipe(swipe.end(velocity, interrupted));
    endPan(velocity, interrupted);
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
      const origin = gesture.origin();
      gesturing = taking(gestures, under);
      warnOverlap('useGesture', gesturing.length);
      for (const listener of gesturing) listener.begin(origin);
      panning = taking(pans, under);
      warnOverlap('usePan', panning.length);
      for (const listener of panning) listener.begin(origin);
      swipe.start(origin);
    },
    join: (finger) => {
      const velocity = gesture.velocity(finger.t);
      gesture.down(finger);
      moved = true;
      endSwipe(swipe.join(velocity));
      endPan(velocity, true);
    },
    move: (finger) => {
      const values = gesture.move(finger);
      if (values === undefined) return;
      if (Math.max(Math.abs(values.x), Math.abs(values.y)) >= AXIS_LOCK_PX) {
        moved = true;
      }
      for (const listener of gesturing) listener.update(values);
      for (const listener of panning) listener.update(values.x, values.y);
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
    held: (pressed) => options.onHold?.(pressed),
  };

  const wanted = (predicate: (listener: Listener) => boolean) =>
    [gestures, pans, swipes, taps].some((listeners) =>
      [...listeners].some(
        (listener) => listener.enabled() && predicate(listener),
      ),
    );

  const wantsHold = () => wanted((listener) => listener.hold());
  const wantsPinch = () =>
    [...gestures].some((listener) => listener.enabled() && !listener.hold());

  const machine = createActor(zoneMachine, {
    input: {
      inHoldZone: options.inHoldZone ?? (() => false),
      wantsHold,
      wantsPinch,
      output,
    },
  }).start();

  const sink: PointerSink = {
    holding: () => machine.getSnapshot().matches('held'),
    down: (finger) => machine.send({ type: 'finger.down', finger }),
    move: (finger) => machine.send({ type: 'finger.move', finger }),
    up: (finger) => {
      // Only one finger lifting without moving, with no Hold, still clicks.
      const snapshot = machine.getSnapshot();
      const clicks =
        snapshot.matches('pressing') ||
        snapshot.matches({ armed: 'quick' }) ||
        snapshot.matches('arming');
      machine.send({ type: 'finger.up', finger });
      return !clicks;
    },
    cancelAll: () => machine.send({ type: 'cancel' }),
  };

  const phase = (): HoldPhase => {
    const snapshot = machine.getSnapshot();
    if (snapshot.matches('held')) return 'on';
    if (snapshot.matches('armed')) return 'armed';
    if (snapshot.matches('arming')) return 'pressing';
    return 'off';
  };

  // Calls `watcher` whenever `read` gives something new; returns the unwatch.
  const watching =
    <T>(read: () => T) =>
    (watcher: () => void) => {
      let last = read();
      const subscription = machine.subscribe(() => {
        const next = read();
        if (next === last) return;
        last = next;
        watcher();
      });
      return () => subscription.unsubscribe();
    };

  const state = () => {
    const value = machine.getSnapshot().value;
    return typeof value === 'string'
      ? value
      : Object.entries(value)
          .map(([parent, child]) => `${parent}.${String(child)}`)
          .join();
  };

  return {
    sink,
    /** Whether the Hold is on now. */
    hold: () => phase() === 'on',
    watchHold: watching(() => phase() === 'on'),
    /** Where the Hold is now, for showing it. */
    phase,
    watchPhase: watching(phase),
    /** Whether the Hold, if it starts now, takes a press: a pinch is expected. */
    holdTakesPress: () => wantsHold() && wantsPinch(),
    /** Where the first finger down landed, in viewport px. */
    origin: () => gesture.origin(),
    /** The machine's state now, such as `held.acting`, for debugging. */
    state,
    watchState: watching(state),
    addGesture: (listener: GestureListener) =>
      register(gestures, listener, () => {
        gesturing = gesturing.filter((other) => other !== listener);
      }),
    addPan: (listener: PanListener) =>
      register(pans, listener, () => {
        panning = panning.filter((other) => other !== listener);
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
