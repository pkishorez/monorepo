import {
  type PointerSink,
  TRAPPED_ATTRIBUTE,
  zoneOf,
} from '../../touch-input/index.ts';
import { createPointers, type Pointer, type Pointers } from './pointers.ts';

export type { Pointer, Pointers } from './pointers.ts';

/**
 * How a Gesture ended. `interrupted` when the browser took the touch or the
 * page lost focus, rather than the last finger lifting. `preventClick`
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
};

/**
 * A Gesture Provider's tracker: the one Gesture under way, and the
 * listeners of each of its zones. When a first finger lands in one of its
 * zones, the Gesture is heard by that zone and each zone above it, up to
 * and including the first trapped one; every enabled listener of those
 * zones takes it. Every later finger joins it, unless it lands in another
 * provider's zone. Whether the last finger's release clicks what is under
 * it is the browser's call, unless a listener prevents it.
 */
export const createTracker = () => {
  const zones = new Set<Element>();
  const listeners = new Map<Element, Set<GestureListener>>();
  const fingers = createPointers();
  let taking: ReadonlyArray<GestureListener> = [];

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
    for (const listener of taking) listener.end(pointers, end);
    taking = [];
    fingers.clear();
    return prevented;
  };

  const sink: PointerSink = {
    active: fingers.active,
    down: (sample) => {
      const starting = !fingers.active();
      if (starting) {
        const heard = hearing(sample.target);
        if (heard.length === 0) return false;
        taking = heard
          .flatMap((zone) => [...(listeners.get(zone) ?? [])])
          .filter((listener) => listener.enabled());
      } else {
        // Another provider's zone keeps its own fingers.
        const zone = zoneOf(sample.target);
        if (zone !== null && !zones.has(zone)) return false;
      }
      const pointer = fingers.down(sample);
      if (pointer === undefined) return false;
      if (starting) {
        for (const listener of taking) listener.start(fingers.pointers());
      }
      for (const listener of taking) {
        listener.pointer(pointer, fingers.pointers());
      }
      return true;
    },
    move: (sample) => fingers.move(sample),
    up: (sample) => {
      const pointer = fingers.up(sample);
      if (pointer === undefined) return false;
      for (const listener of taking) {
        listener.pointer(pointer, fingers.pointers());
      }
      return fingers.active() ? true : finish(false);
    },
    captures: () => {
      const [first] = fingers.pointers().values();
      if (first === undefined) return false;
      return taking.some(
        (listener) => listener.captures?.(first.start) === true,
      );
    },
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
        taking = taking.filter((other) => other !== listener);
      };
    },
  };
};

export type Tracker = ReturnType<typeof createTracker>;
