import { type GestureListener, Swipe } from '@kstackz/use-gesture';

/** How wide the strip along the left edge that is always the Sidebar's is, in points. */
export const EDGE_STRIP = 24;

/**
 * A swipe right of one finger from anywhere, as a Gesture listener in the
 * surface's own zone, the outermost: a zone inside that wants a swipe right,
 * such as Pages past their first or a row scrolled from its start, keeps
 * it, and this one drops it. A finger landing in the strip along the left
 * edge is its own from the start, even over a zone inside or a list that
 * scrolls: it claims the touch as the finger lands, so a scroll under it
 * cannot start first (a scroll view's own pan begins before the swipe's
 * Direction is known); a tap there still taps, as only a moving finger is
 * taken. Anywhere else it claims the touch once its Direction is right. As
 * it goes, `onMove` hears how far right the finger is, in points; as it
 * lifts, `onEnd` hears whether it went far or fast enough to open (Swipe's
 * DEFAULT_COMMIT) and its speed, in points a second. A second finger, such
 * as a resting thumb's partner, ends it shut and leaves the touch to the
 * others.
 */
export const sidebarSwipe = (options: {
  readonly enabled: () => boolean;
  readonly onMove: (offset: number) => void;
  readonly onEnd: (open: boolean, speed: number) => void;
  readonly claim: () => void;
  readonly clock: () => number;
}): GestureListener<unknown> => {
  let fingers = 0;
  let edge = false;
  let tracking = false;
  let velocity = Swipe.createVelocity();

  const reset = () => {
    fingers = 0;
    edge = false;
    tracking = false;
  };

  return {
    enabled: options.enabled,
    acts: () => true,
    start: (pointers) => {
      const [first] = pointers.values();
      edge = first !== undefined && first.start.x <= EDGE_STRIP;
      velocity = Swipe.createVelocity();
      if (edge) options.claim();
    },
    pointer: (_pointer, pointers) => {
      fingers = [...pointers.values()].filter(
        (finger) => finger.end === undefined,
      ).length;
      if (fingers > 1) {
        if (tracking) options.onEnd(false, 0);
        edge = false;
        tracking = false;
      }
    },
    captures: () => edge && fingers === 1,
    directions: () => (fingers === 1 ? ['right'] : []),
    direction: (way) => {
      if (fingers !== 1 || way !== 'right') return;
      tracking = true;
      if (!edge) options.claim();
    },
    move: (pointer) => {
      if (!tracking) return;
      const offset = Swipe.along('right', pointer);
      velocity.add(options.clock(), offset);
      options.onMove(Math.max(0, offset));
    },
    end: (pointers, end) => {
      const [first] = pointers.values();
      const was = tracking;
      reset();
      if (!was) return;
      if (end.interrupted || first === undefined) {
        options.onEnd(false, 0);
        return;
      }
      const offset = Math.max(0, Swipe.along('right', first));
      const speed = velocity.at(options.clock(), offset);
      options.onEnd(Swipe.commits(Swipe.DEFAULT_COMMIT, offset, speed), speed);
    },
  };
};
