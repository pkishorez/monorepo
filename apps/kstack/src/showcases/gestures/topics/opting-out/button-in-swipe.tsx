import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { useGesture } from '@kstackz/use-gesture/core';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { animate, motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;

/**
 * A button on a card that follows a Swipe right. A finger that moved more
 * than a few px was a Swipe, so its release must not click the button.
 */
export function ButtonInSwipe() {
  const [clicks, setClicks] = useState(0);
  const swipe = useSwipe({
    direction: 'right',
    onCommit: () => animate(swipe.offset, 0, SPRING),
    onCancel: () => animate(swipe.offset, 0, SPRING),
  });
  useGesture({
    onEnd: (pointers, { preventClick }) => {
      const [first] = pointers.values();
      if (first && Math.hypot(first.dx.get(), first.dy.get()) > 10) {
        preventClick();
      }
    },
  });
  useStageStatus(
    swipe.state === 'tracking'
      ? 'A Swipe: no click'
      : clicks > 0
        ? `Clicked ${clicks}×`
        : undefined,
  );

  return (
    <motion.div
      className="absolute inset-0 grid place-items-center"
      style={{ x: swipe.offset }}
    >
      <Button
        variant="outline"
        className="tabular-nums"
        onClick={() => setClicks((n) => n + 1)}
      >
        Clicked {clicks}×
      </Button>
    </motion.div>
  );
}
