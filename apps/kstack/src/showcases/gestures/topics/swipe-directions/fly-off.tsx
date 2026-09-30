import {
  type Direction,
  type SwipeOptions,
  useSwipe,
} from '@kstackz/use-gesture/recognizers';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', bounce: 0, duration: 0.35 } as const;

/**
 * A card that follows a Swipe left or right, flies off the way it went on a
 * Commit, and springs back on a Cancel.
 */
export function FlyOff() {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-8, 8]);
  const [card, setCard] = useState(1);
  const [last, setLast] = useState<string>();
  // The Swipe that locked: the other one Cancels with `direction` and must not move the card.
  const following = useRef<Direction>(undefined);

  const options = (direction: 'left' | 'right'): SwipeOptions => {
    const sign = direction === 'left' ? -1 : 1;
    return {
      direction,
      onStart: () => {
        following.current = direction;
        x.stop();
      },
      onCommit: ({ velocity }) => {
        following.current = undefined;
        setLast(`Flew ${direction}`);
        animate(x, sign * innerWidth, {
          ...SPRING,
          velocity: sign * velocity,
        }).then(() => {
          x.jump(0);
          setCard((n) => n + 1);
        });
      },
      onCancel: (reason) => {
        if (following.current !== direction) return;
        following.current = undefined;
        setLast(`Back: ${reason}`);
        animate(x, 0, SPRING);
      },
    };
  };
  const left = useSwipe(options('left'));
  const right = useSwipe(options('right'));

  useMotionValueEvent(left.offset, 'change', (v) => {
    if (following.current === 'left') x.set(-v);
  });
  useMotionValueEvent(right.offset, 'change', (v) => {
    if (following.current === 'right') x.set(v);
  });

  useStageStatus(
    left.state === 'tracking'
      ? 'Tracking left'
      : right.state === 'tracking'
        ? 'Tracking right'
        : last,
  );

  return (
    <div className="absolute inset-0 grid place-items-center">
      <motion.div
        key={card}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="grid h-44 w-36 place-items-center rounded-2xl bg-muted text-3xl font-semibold shadow-sm ring-1 ring-edge"
        style={{ x, rotate }}
      >
        {card}
      </motion.div>
    </div>
  );
}
