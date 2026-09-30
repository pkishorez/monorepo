import {
  type Direction,
  type Directions,
  directionOf,
  type PointerSink,
  SLOP,
  TRAPPED_ATTRIBUTE,
  wants,
  zoneOf,
} from '../../touch-input/index.ts';
import { createPointers, type Pointer, type Pointers } from './pointers.ts';

export type { Pointer, Pointers } from './pointers.ts';

/**
 * How a Gesture ended. `interrupted` when the browser took the touch, the
 * page lost focus, or another zone took it, rather than the last finger
 * lifting. `preventClick`
 * stops the last finger's release from also clicking what is under it; call
 * it during `onEnd`. Otherwise the browser decides whether it clicks.
 */
export type GestureEnd = {
  readonly interrupted: boolean;
  readonly preventClick: () => void;
};

export type GestureListener = {
  /** Whether it takes the next Gesture, read as the first finger lands. */
  readonly enabled: () => boolean;
  readonly start: (pointers: Pointers) => void;
  /** A finger landed or lifted. */
  readonly pointer: (pointer: Pointer, pointers: Pointers) => void;
  readonly end: (pointers: Pointers, end: GestureEnd) => void;
  /**
   * Whether it captures a touch whose first finger landed at `point`, even
   * over a Native Scroll. Read at the touch's first movement.
   */
  readonly captures?: (point: {
    readonly x: number;
    readonly y: number;
  }) => boolean;
  /** The Directions it takes touches in. Read at the touch's first movement. */
  readonly directions?: () => Directions | undefined;
  /**
   * Whether it acts on what it hears, rather than only watching: when
   * another zone takes the Gesture, it drops it. False by default.
   */
  readonly acts?: () => boolean;
  /** The Gesture first moved in `direction`. */
  readonly direction?: (direction: Direction) => void;
};

type Taking = { readonly zone: Element; readonly listener: GestureListener };

/**
 * A Gesture Provider's tracker: the one Gesture under way, and the
 * listeners of each of its zones. When a first finger lands in one of its
 * zones, the Gesture is heard by that zone and each zone above it, up to
 * and including the first trapped one; every enabled listener of those
 * zones takes it. At its first movement one zone takes it: the innermost
 * whose listener captures where the first finger landed, or else the
 * innermost with a listener that wants its Direction. Listeners that act in
 * the other zones then drop it; those that only watch keep it. Every later
 * finger joins it, unless it lands in another provider's zone. Whether the
 * last finger's release clicks what is under it is the browser's call,
 * unless a listener prevents it.
 */
export const createTracker = () => {
  const zones = new Set<Element>();
  const listeners = new Map<Element, Set<GestureListener>>();
  const fingers = createPointers();
  let taking: ReadonlyArray<Taking> = [];
  // Whether the Gesture under way has first moved, and which way.
  let settled = false;
  let direction: Direction | undefined;

  // The zones that hear a Gesture starting on `target`, innermost first.
  const hearing = (target: Element | null) => {
    const heard: Array<Element> = [];
    let zone = zoneOf(target);
    while (zone !== null && zones.has(zone)) {
      heard.push(zone);
      if (zone.hasAttribute(TRAPPED_ATTRIBUTE)) break;
      zone = zoneOf(zone.parentElement);
    }
    return heard;
  };

  // Ends the Gesture; returns whether it must not click.
  const finish = (interrupted: boolean) => {
    const pointers = fingers.pointers();
    let prevented = false;
    const end = { interrupted, preventClick: () => (prevented = true) };
    for (const { listener } of taking) listener.end(pointers, end);
    taking = [];
    settled = false;
    direction = undefined;
    fingers.clear();
    return prevented;
  };

  // The zone that takes the Gesture if it moves in `way`, and how: first
  // the innermost that captures where it landed, then the innermost that
  // wants `way`. `taking` lists zones innermost first.
  const pick = (way: Direction | undefined) => {
    const [first] = fingers.pointers().values();
    if (first === undefined) return undefined;
    const capturing = taking.find(
      ({ listener }) => listener.captures?.(first.start) === true,
    );
    if (capturing) return { zone: capturing.zone, how: 'captures' as const };
    const wanting = taking.find(({ listener }) =>
      wants(listener.directions?.(), way),
    );
    if (wanting) return { zone: wanting.zone, how: 'directions' as const };
    return undefined;
  };

  const settle = (way: Direction | undefined) => {
    if (settled || !fingers.active()) return;
    settled = true;
    direction = way;
    const taker = pick(way);
    if (way !== undefined) {
      for (const { listener } of taking) listener.direction?.(way);
    }
    if (taker === undefined) return;
    const dropped = taking.filter(
      ({ zone, listener }) => zone !== taker.zone && listener.acts?.() === true,
    );
    taking = taking.filter((entry) => !dropped.includes(entry));
    const end = { interrupted: true, preventClick: () => {} };
    for (const { listener } of dropped) listener.end(fingers.pointers(), end);
  };

  const sink: PointerSink = {
    active: fingers.active,
    down: (sample) => {
      const starting = !fingers.active();
      if (starting) {
        const heard = hearing(sample.target);
        if (heard.length === 0) return false;
        taking = heard
          .flatMap((zone) =>
            [...(listeners.get(zone) ?? [])].map((listener) => ({
              zone,
              listener,
            })),
          )
          .filter(({ listener }) => listener.enabled());
      } else {
        // Another provider's zone keeps its own fingers.
        const zone = zoneOf(sample.target);
        if (zone !== null && !zones.has(zone)) return false;
      }
      const pointer = fingers.down(sample);
      if (pointer === undefined) return false;
      if (starting) {
        for (const { listener } of taking) listener.start(fingers.pointers());
      }
      for (const { listener } of taking) {
        listener.pointer(pointer, fingers.pointers());
      }
      return true;
    },
    move: (sample) => {
      fingers.move(sample);
      // With no touch event to read it first, such as for a mouse, the
      // Direction is read once a pointer has moved SLOP px.
      const pointer = fingers.pointers().get(sample.id);
      if (settled || pointer === undefined) return;
      const dx = pointer.dx.get();
      const dy = pointer.dy.get();
      if (Math.hypot(dx, dy) >= SLOP) settle(directionOf(dx, dy));
    },
    up: (sample) => {
      const pointer = fingers.up(sample);
      if (pointer === undefined) return false;
      for (const { listener } of taking) {
        listener.pointer(pointer, fingers.pointers());
      }
      return fingers.active() ? true : finish(false);
    },
    direction: () => direction,
    pick: (way) => pick(way)?.how,
    settle,
    claimsEdge: (point, inward) =>
      taking.some(
        ({ listener }) =>
          listener.captures?.(point) === true ||
          wants(listener.directions?.(), inward),
      ),
    cancelAll: () => {
      if (!fingers.active()) return;
      // Pointer events stamp their time on the same clock.
      fingers.lift(performance.now());
      finish(true);
    },
  };

  return {
    sink,
    /** Makes `element` one of this provider's zones; returns the removal. */
    addZone: (element: Element) => {
      zones.add(element);
      return () => {
        zones.delete(element);
      };
    },
    /** Adds a listener to the zone `element`; returns the removal. */
    addGesture: (element: Element, listener: GestureListener) => {
      const own = listeners.get(element) ?? new Set();
      own.add(listener);
      listeners.set(element, own);
      return () => {
        own.delete(listener);
        if (own.size === 0) listeners.delete(element);
        taking = taking.filter((other) => other.listener !== listener);
      };
    },
  };
};

export type Tracker = ReturnType<typeof createTracker>;
