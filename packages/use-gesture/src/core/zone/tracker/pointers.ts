import { type MotionValue, motionValue } from 'motion/react';
import type { PointerSample } from '../../touch-input/index.ts';

/**
 * A point in viewport px at time `t`, in ms since the Gesture's first
 * finger landed.
 */
export type Sample = {
  readonly x: number;
  readonly y: number;
  readonly t: number;
};

/**
 * One finger of a Gesture, from landing until the Gesture ends. `target` is
 * the element it landed on. `x` and `y`
 * are where it is now, in viewport px; `dx` and `dy` how far it is from
 * where it landed. They follow it while it is down and keep where it lifted
 * after. `end` is set once it lifts.
 */
export type Pointer = {
  readonly id: number;
  readonly target: Element | null;
  readonly start: Sample;
  readonly x: MotionValue<number>;
  readonly y: MotionValue<number>;
  readonly dx: MotionValue<number>;
  readonly dy: MotionValue<number>;
  readonly end?: Sample;
};

/** Every finger of a Gesture, by id, in the order they landed. */
export type Pointers = ReadonlyMap<number, Pointer>;

/**
 * Reads one Gesture from the pointer events on the zone: every finger that
 * lands between the first landing and the last lifting, each with its own
 * motion values. Times count from the first landing. `down` and `up` return
 * the new map, or none when the event was not the Gesture's.
 */
export const createPointers = () => {
  let pointers: Pointers = new Map();
  // The first landing's time, in the events' own clock.
  let zero = 0;

  const live = (id: number) => {
    const pointer = pointers.get(id);
    return pointer?.end === undefined ? pointer : undefined;
  };

  const place = (pointer: Pointer, sample: PointerSample) => {
    pointer.x.set(sample.x);
    pointer.y.set(sample.y);
    pointer.dx.set(sample.x - pointer.start.x);
    pointer.dy.set(sample.y - pointer.start.y);
  };

  const replace = (pointer: Pointer) => {
    const next = new Map(pointers);
    next.set(pointer.id, pointer);
    pointers = next;
    return pointer;
  };

  return {
    /** Every finger of the Gesture under way; empty between Gestures. */
    pointers: () => pointers,
    /** Whether some finger is down. */
    active: () => [...pointers.values()].some((p) => p.end === undefined),
    /** A finger landed: it joins the Gesture, or starts one. */
    down: (sample: PointerSample) => {
      if (pointers.has(sample.id)) return undefined;
      if (pointers.size === 0) zero = sample.t;
      return replace({
        id: sample.id,
        target: sample.target,
        start: { x: sample.x, y: sample.y, t: sample.t - zero },
        x: motionValue(sample.x),
        y: motionValue(sample.y),
        dx: motionValue(0),
        dy: motionValue(0),
      });
    },
    /** A finger moved. */
    move: (sample: PointerSample) => {
      const pointer = live(sample.id);
      if (pointer !== undefined) place(pointer, sample);
    },
    /** A finger lifted; it stays in the Gesture with its `end`. */
    up: (sample: PointerSample) => {
      const pointer = live(sample.id);
      if (pointer === undefined) return undefined;
      place(pointer, sample);
      return replace({
        ...pointer,
        end: { x: sample.x, y: sample.y, t: sample.t - zero },
      });
    },
    /** Every finger still down lifts where it is, at `t`. */
    lift: (t: number) => {
      for (const pointer of pointers.values()) {
        if (pointer.end !== undefined) continue;
        replace({
          ...pointer,
          end: { x: pointer.x.get(), y: pointer.y.get(), t: t - zero },
        });
      }
    },
    /** The Gesture is over: the next landing starts a new one. */
    clear: () => {
      pointers = new Map();
    },
  };
};
