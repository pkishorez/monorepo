import type { Direction, GestureListener } from '@kstackz/use-gesture';

/**
 * Where a scroll view is, along the way it scrolls, in points: how far from
 * its start, how long its window is, and how long what it holds is.
 */
export type ScrollPlace = {
  readonly offset: number;
  readonly size: number;
  readonly content: number;
};

// Less than this, in points, from an end is at that end.
const END = 0.5;

// Whether a scroll view at `place` can follow a finger moving `way`: right
// (or down) while it is past its start, left (or up) while it is short of
// its end.
const follows = (place: ScrollPlace, horizontal: boolean, way: Direction) => {
  if (way === (horizontal ? 'right' : 'down')) return place.offset > END;
  if (way === (horizontal ? 'left' : 'up')) {
    return place.offset < place.content - place.size - END;
  }
  return false;
};

/**
 * A Native Scroll as a Gesture listener: a scroll view keeps a one-finger
 * swipe it can still scroll, as on the web, and gives every other swipe to
 * the zones around it. It wants the Directions it can follow the finger in
 * right now (`place()`). It acts, so a zone around it that wants the same
 * Direction drops the swipe; it never claims, as the scroll view scrolls by
 * itself.
 */
export const nativeScroll = (
  horizontal: boolean,
  place: () => ScrollPlace,
): GestureListener<unknown> => {
  let fingers = 0;
  const ways: ReadonlyArray<Direction> = horizontal
    ? ['right', 'left']
    : ['down', 'up'];
  return {
    enabled: () => true,
    start: () => {},
    pointer: (_pointer, pointers) => {
      fingers = [...pointers.values()].filter(
        (finger) => finger.end === undefined,
      ).length;
    },
    end: () => {},
    acts: () => true,
    directions: () =>
      fingers === 1
        ? ways.filter((way) => follows(place(), horizontal, way))
        : [],
  };
};
