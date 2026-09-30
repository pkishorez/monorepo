import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { animate, motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;

/**
 * A list that scrolls up and down, in a zone that listens for a Swipe left
 * or right. Each direction goes where it should.
 */
export function VerticalList() {
  const [scrolling, setScrolling] = useState(false);
  const left = useSwipe({
    direction: 'left',
    onCommit: () => animate(left.offset, 0, SPRING),
    onCancel: () => animate(left.offset, 0, SPRING),
  });
  const right = useSwipe({
    direction: 'right',
    onCommit: () => animate(right.offset, 0, SPRING),
    onCancel: () => animate(right.offset, 0, SPRING),
  });
  const x = useTransform(() => right.offset.get() - left.offset.get());
  const swiping = left.state === 'tracking' || right.state === 'tracking';
  useStageStatus(
    swiping
      ? 'The zone has it: a Swipe'
      : scrolling
        ? 'The list has it: a scroll'
        : undefined,
  );

  return (
    <motion.div
      className="absolute inset-0 overflow-y-auto"
      style={{ x }}
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
