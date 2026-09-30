import { ArrowLeftIcon } from '@kstackz/ui-toolkit/lucide';
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
 * A Swipe left that counts only when its first finger lands within 24px of
 * the screen's right edge. A handle follows it and springs back.
 */
export function RightEdge() {
  const x = useMotionValue(0);
  const [last, setLast] = useState<string>();
  const swipe = useSwipe({
    direction: 'left',
    from: { edge: 'right', within: WITHIN },
    onCommit: () => {
      setLast('Committed');
      animate(x, 0, SPRING);
    },
    onCancel: (reason) => {
      setLast(`Cancelled: ${reason}`);
      animate(x, 0, SPRING);
    },
  });
  useMotionValueEvent(swipe.offset, 'change', (v) => x.jump(-v));
  // Every Gesture, from the edge or not: the Swipe overwrites this if it was.
  useGesture({ onStart: () => setLast('Not from the edge') });
  useStageStatus(
    swipe.state === 'tracking'
      ? 'Tracking left'
      : swipe.state === 'possible'
        ? 'From the edge'
        : last,
  );
  const strip = useTransform(swipe.willCommit, (commit) => (commit ? 1 : 0.4));

  return (
    <>
      <motion.div
        className="absolute inset-y-0 right-0 border-l border-dashed border-primary bg-primary/15"
        style={{ width: WITHIN, opacity: strip }}
      />
      <motion.div
        className="absolute top-1/2 right-8 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-muted shadow-sm"
        style={{ x }}
      >
        <ArrowLeftIcon className="size-5" aria-hidden="true" />
      </motion.div>
    </>
  );
}
