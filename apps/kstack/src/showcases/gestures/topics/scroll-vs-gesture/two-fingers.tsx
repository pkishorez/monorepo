import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { animate, motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;

/**
 * A list that scrolls under one finger. Two fingers down before moving are
 * the zone's: a two-finger Swipe up or down moves the whole list.
 */
export function TwoFingers() {
  const [scrolling, setScrolling] = useState(false);
  const up = useSwipe({
    direction: 'up',
    fingers: 2,
    onCommit: () => animate(up.offset, 0, SPRING),
    onCancel: () => animate(up.offset, 0, SPRING),
  });
  const down = useSwipe({
    direction: 'down',
    fingers: 2,
    onCommit: () => animate(down.offset, 0, SPRING),
    onCancel: () => animate(down.offset, 0, SPRING),
  });
  const y = useTransform(() => (down.offset.get() - up.offset.get()) / 2);
  const swiping = up.state === 'tracking' || down.state === 'tracking';
  useStageStatus(
    swiping
      ? 'Two fingers: the zone has it'
      : scrolling
        ? 'One finger: the list has it'
        : undefined,
  );

  return (
    <motion.div
      className="absolute inset-0 overflow-y-auto"
      style={{ y }}
      onScroll={() => setScrolling(true)}
      onScrollEnd={() => setScrolling(false)}
    >
      <ul className="flex flex-col divide-y divide-border">
        {Array.from({ length: 40 }, (_, i) => (
          <li key={i} className="px-4 py-3 text-sm">
            Row {i + 1}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
