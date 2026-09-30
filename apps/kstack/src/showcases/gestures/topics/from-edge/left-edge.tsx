import { ArrowRightIcon } from '@kstackz/ui-toolkit/lucide';
import { useGesture } from '@kstackz/use-gesture/core';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const WITHIN = 24;
const SPRING = { type: 'spring', bounce: 0, duration: 0.3 } as const;

/**
 * A Swipe right that counts only when its first finger lands within 24px of
 * the screen's left edge. A handle follows it and springs back.
 */
export function LeftEdge() {
  const x = useMotionValue(0);
  const [last, setLast] = useState<string>();
  const swipe = useSwipe({
    direction: 'right',
    from: { edge: 'left', within: WITHIN },
    onCommit: () => {
      setLast('Committed');
      animate(x, 0, SPRING);
    },
    onCancel: (reason) => {
      setLast(`Cancelled: ${reason}`);
      animate(x, 0, SPRING);
    },
  });
  useMotionValueEvent(swipe.offset, 'change', (v) => x.jump(v));
  // Every Gesture, from the edge or not: the Swipe overwrites this if it was.
  useGesture({ onStart: () => setLast('Not from the edge') });
  useStageStatus(
    swipe.state === 'tracking'
      ? 'Tracking right'
      : swipe.state === 'possible'
        ? 'From the edge'
        : last,
  );
  const strip = useTransform(swipe.willCommit, (commit) => (commit ? 1 : 0.4));

  return (
    <>
      <motion.div
        className="absolute inset-y-0 left-0 border-r border-dashed border-primary bg-primary/15"
        style={{ width: WITHIN, opacity: strip }}
      />
      <motion.div
        className="absolute top-1/2 left-8 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-muted shadow-sm"
        style={{ x }}
      >
        <ArrowRightIcon className="size-5" aria-hidden="true" />
      </motion.div>
    </>
  );
}
