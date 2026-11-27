import { useEffect } from 'react';
import {
  animate,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from 'motion/react';
import { useSwipe } from '@kestack/web-platform/ui/input';

export const settle = { duration: 0.32, ease: [0.32, 0.72, 0, 1] } as const;

export function Swipes({
  x,
  rest = 0,
  follow = 1,
  onLeft,
  onRight,
}: {
  x: MotionValue<number>;
  rest?: number;
  follow?: number;
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
  useMotionValueEvent(left.offset, 'change', (offset) => {
    if (!reduced) x.set(rest - offset * follow);
  });
  useMotionValueEvent(right.offset, 'change', (offset) => {
    if (!reduced) x.set(rest + offset * follow);
  });
  return null;
}

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
