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

// Wider than the sides: iOS keeps the last few px for its own home gesture.
const WITHIN = 40;
const SPRING = { type: 'spring', bounce: 0, duration: 0.3 } as const;

/**
 * A Swipe up that counts only when its first finger lands within 40px of the
 * screen's bottom edge, like a home bar. The page shrinks as it goes, and
 * springs back.
 */
export function BottomEdge() {
  const y = useMotionValue(0);
  const scale = useTransform(y, [0, 300], [1, 0.8]);
  const [last, setLast] = useState<string>();
  const swipe = useSwipe({
    direction: 'up',
    from: { edge: 'bottom', within: WITHIN },
    onCommit: () => {
      setLast('Committed');
      animate(y, 0, SPRING);
    },
    onCancel: (reason) => {
      setLast(`Cancelled: ${reason}`);
      animate(y, 0, SPRING);
    },
  });
  useMotionValueEvent(swipe.offset, 'change', (v) => y.jump(v));
  // Every Gesture, from the edge or not: the Swipe overwrites this if it was.
  useGesture({ onStart: () => setLast('Not from the edge') });
  useStageStatus(
    swipe.state === 'tracking'
      ? 'Tracking up'
      : swipe.state === 'possible'
        ? 'From the edge'
        : last,
  );
  const strip = useTransform(swipe.willCommit, (commit) => (commit ? 1 : 0.4));

  return (
    <>
      <motion.div
        className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] bottom-24 origin-bottom rounded-3xl bg-muted"
        style={{ scale }}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 border-t border-dashed border-primary bg-primary/15"
        style={{ height: WITHIN, opacity: strip }}
      />
    </>
  );
}
