import { useEffect } from 'react';
import {
  animate,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from 'motion/react';
import { useSwipe } from '@kestack/web-platform/ui/input';

/*
 * The swipes a Gesture Zone answers, sideways, followed as they happen:
 * while a finger goes left or right, `x` follows it from where the content
 * rests, so the content moves under the finger. Let go far or fast enough
 * and the swipe's handler runs, and the content goes where that leaves
 * it; short of that it springs back. Rendered inside the zone; a way
 * with no handler takes no touch, and anything under the finger that can
 * still scroll that way, a long line of code say, keeps the touch.
 */

/** How the content moves when it is let go of: quick out, soft in. */
export const settle = { duration: 0.32, ease: [0.32, 0.72, 0, 1] } as const;

export function Swipes({
  x,
  rest = 0,
  follow = 1,
  onLeft,
  onRight,
}: {
  /** Where the content sits, in px across. */
  x: MotionValue<number>;
  /** Where it rests between swipes. */
  rest?: number;
  /** How far the content goes for each px the finger does. */
  follow?: number;
  /** A finger went left far enough; undefined while that does nothing. */
  onLeft?: () => void;
  onRight?: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const back = () => {
    if (reduced) x.set(rest);
    else animate(x, rest, settle);
  };
  const left = useSwipe({
    direction: 'left',
    enabled: onLeft !== undefined,
    onCommit: () => onLeft?.(),
    onCancel: back,
  });
  const right = useSwipe({
    direction: 'right',
    enabled: onRight !== undefined,
    onCommit: () => onRight?.(),
    onCancel: back,
  });
  // An offset moves only while its swipe is tracking, and is back at 0
  // as the next touch lands, where the content already rests.
  useMotionValueEvent(left.offset, 'change', (offset) => {
    if (!reduced) x.set(rest - offset * follow);
  });
  useMotionValueEvent(right.offset, 'change', (offset) => {
    if (!reduced) x.set(rest + offset * follow);
  });
  return null;
}

/** Moves `x` to rest at `to` whenever that changes; at once with reduced motion. */
export function useRestAt(x: MotionValue<number>, to: number) {
  const reduced = useReducedMotion() ?? false;
  useEffect(() => {
    if (reduced) {
      x.set(to);
      return;
    }
    const motion = animate(x, to, settle);
    return () => motion.stop();
  }, [x, to, reduced]);
}
