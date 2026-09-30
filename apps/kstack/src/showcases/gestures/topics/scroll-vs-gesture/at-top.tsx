import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { animate, motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;

/**
 * A list already at its top can't scroll down any further, and the Swipe
 * wants down, so a drag down is the zone's: the list follows it, with
 * resistance. A drag up scrolls the list.
 */
export function AtTop() {
  const [scrolling, setScrolling] = useState(false);
  const pull = useSwipe({
    direction: 'down',
    onCommit: () => animate(pull.offset, 0, SPRING),
    onCancel: () => animate(pull.offset, 0, SPRING),
  });
  const y = useTransform(pull.offset, (offset) => offset / 2);
  useStageStatus(
    pull.state === 'tracking'
      ? 'The zone has it: a pull'
      : scrolling
        ? 'The list has it: a scroll'
        : undefined,
  );

  return (
    <>
      <p className="absolute inset-x-0 top-3 text-center text-xs text-muted-foreground">
        Pulled by the zone
      </p>
      <motion.div
        className="absolute inset-0 overflow-y-auto bg-card"
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
    </>
  );
}
