import { useGesture } from '@kstackz/use-gesture/core';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { animate, motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;

/**
 * A short list, and a zone that pulls it up at its end. A scroll that
 * reaches the end mid-drag keeps the touch: its Gesture ended Interrupted
 * as the scroll took it. Only a fresh drag at the end reaches the zone.
 */
export function EndMidDrag() {
  const [scrolling, setScrolling] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  useGesture({
    onStart: () => setInterrupted(false),
    onEnd: (_pointers, end) => setInterrupted(end.interrupted),
  });
  const pull = useSwipe({
    direction: 'up',
    onCommit: () => animate(pull.offset, 0, SPRING),
    onCancel: () => animate(pull.offset, 0, SPRING),
  });
  const y = useTransform(pull.offset, (offset) => -offset / 2);
  useStageStatus(
    pull.state === 'tracking'
      ? 'The zone has it: a pull'
      : interrupted
        ? scrolling
          ? 'Interrupted: the list keeps it'
          : 'Interrupted'
        : undefined,
  );

  return (
    <>
      <p className="absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">
        Pulled by the zone
      </p>
      <motion.div
        className="absolute inset-0 overflow-y-auto bg-card"
        style={{ y }}
        onScroll={() => setScrolling(true)}
        onScrollEnd={() => setScrolling(false)}
      >
        <ul className="flex flex-col divide-y divide-border">
          {Array.from({ length: 12 }, (_, i) => (
            <li key={i} className="px-4 py-3 text-sm">
              Row {i + 1}
            </li>
          ))}
        </ul>
      </motion.div>
    </>
  );
}
