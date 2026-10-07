import type { Direction, GestureListener } from '@kstackz/use-gesture';

/**
 * The Pages' zone listener: one finger sideways is theirs only where it
 * turns a page, right past the first and left before the last, so a zone
 * around them gets the rest. The Pan does the turning; this only tells the
 * core which swipes are theirs. It acts, so a zone around that wants the
 * same swipe drops it.
 */
export const turns = () => {
  let page = 0;
  let last = 0;
  let fingers = 0;
  const listener: GestureListener<unknown> = {
    enabled: () => last > 0,
    start: () => {},
    pointer: (_pointer, pointers) => {
      fingers = [...pointers.values()].filter(
        (finger) => finger.end === undefined,
      ).length;
    },
    end: () => {},
    acts: () => true,
    directions: () => {
      if (fingers !== 1) return [];
      const ways: Array<Direction> = [];
      if (page > 0) ways.push('right');
      if (page < last) ways.push('left');
      return ways;
    },
  };
  return {
    listener,
    at: (now: number, end: number) => {
      page = now;
      last = end;
    },
  };
};
