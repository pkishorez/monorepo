import { type MotionValue, motionValue } from 'motion/react';
import type {
  Pointer as CorePointer,
  Pointers as CorePointers,
} from '@kstackz/use-gesture';
import type { Target } from '../touch-input/index.ts';

type Sample = CorePointer<Target>['start'];

/**
 * One finger of a Gesture, from landing until the Gesture ends. `target` is
 * the element it landed on. `x` and `y` are where it is now, in viewport px;
 * `dx` and `dy` how far it is from where it landed. They follow it while it
 * is down and keep where it lifted after. `end` is set once it lifts.
 */
export type Pointer = {
  readonly id: number;
  readonly target: Target;
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
 * The core's Pointers as motion values, for one Gesture Provider: each
 * finger keeps its own motion values for its Gesture, set as the core's
 * Pointer changes, so movement never re-renders React. The map changes only
 * as a finger lands or lifts, as the core's does on those.
 */
export const createMotionPointers = () => {
  let source: CorePointers<Target> | undefined;
  let mirrored: Pointers = new Map();

  return (next: CorePointers<Target>): Pointers => {
    if (next === source) return mirrored;
    source = next;
    let changed = next.size !== mirrored.size;
    const pointers = new Map<number, Pointer>();
    for (const [id, pointer] of next) {
      let own = mirrored.get(id);
      // The same finger keeps its `start` for the whole Gesture.
      if (own === undefined || own.start !== pointer.start) {
        own = {
          id,
          target: pointer.target,
          start: pointer.start,
          x: motionValue(pointer.x),
          y: motionValue(pointer.y),
          dx: motionValue(pointer.dx),
          dy: motionValue(pointer.dy),
        };
        changed = true;
      } else {
        own.x.set(pointer.x);
        own.y.set(pointer.y);
        own.dx.set(pointer.dx);
        own.dy.set(pointer.dy);
      }
      if (pointer.end !== undefined && own.end === undefined) {
        own = { ...own, end: pointer.end };
        changed = true;
      }
      pointers.set(id, own);
    }
    if (changed) mirrored = pointers;
    return mirrored;
  };
};
