import { type GestureListener, Swipe } from '@kstackz/use-gesture';

/** How wide the strip along the left edge that opens the Sidebar is, in points. */
export const EDGE_STRIP = 24;

/**
 * A swipe right of one finger from the left edge, as a Gesture listener:
 * the touch is its own from the first finger landing in the strip, even
 * over a list that scrolls, and it opens with `onOpen` once the finger lifts
 * having gone far or fast enough (Swipe's DEFAULT_COMMIT). A second finger,
 * such as a resting thumb's partner, leaves it to the others. `claim` is
 * called as it starts moving right, so nothing under the finger scrolls.
 */
export const edgeSwipe = (options: {
  readonly enabled: () => boolean;
  readonly onOpen: () => void;
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
    start: (pointers) => {
      const [first] = pointers.values();
      edge = first !== undefined && first.start.x <= EDGE_STRIP;
      velocity = Swipe.createVelocity();
    },
    pointer: (_pointer, pointers) => {
      fingers = [...pointers.values()].filter(
        (finger) => finger.end === undefined,
      ).length;
      if (fingers > 1) {
        edge = false;
        tracking = false;
      }
    },
    captures: () => edge && fingers === 1,
    directions: () => (edge ? ['right'] : []),
    direction: (way) => {
      if (!edge || way !== 'right') return;
      tracking = true;
      options.claim();
    },
    move: (pointer) => {
      if (tracking)
        velocity.add(options.clock(), Swipe.along('right', pointer));
    },
    end: (pointers, end) => {
      const [first] = pointers.values();
      const went = tracking && !end.interrupted && first !== undefined;
      reset();
      if (!went) return;
      const offset = Math.max(0, Swipe.along('right', first));
      const speed = velocity.at(options.clock(), offset);
      if (Swipe.commits(Swipe.DEFAULT_COMMIT, offset, speed)) options.onOpen();
    },
  };
};
