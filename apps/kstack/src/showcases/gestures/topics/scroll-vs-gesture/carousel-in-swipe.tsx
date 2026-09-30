import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { animate, motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;

/**
 * A sideways carousel in a zone that listens for a Swipe left or right. The
 * carousel keeps a touch while it can still scroll that way; past its end,
 * the Swipe is the zone's.
 */
export function CarouselInSwipe() {
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
  const x = useTransform(() => (right.offset.get() - left.offset.get()) / 2);
  const swiping = left.state === 'tracking' || right.state === 'tracking';
  useStageStatus(
    swiping ? 'The zone has it' : scrolling ? 'The carousel has it' : undefined,
  );

  return (
    <motion.div
      className="absolute inset-0 flex flex-col justify-center gap-3"
      style={{ x }}
    >
      <p className="px-4 text-xs font-medium text-muted-foreground">Featured</p>
      <div
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4"
        onScroll={() => setScrolling(true)}
        onScrollEnd={() => setScrolling(false)}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="grid h-40 w-48 shrink-0 snap-start place-items-center rounded-lg bg-muted text-sm"
          >
            Card {i + 1}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
