import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 180;

/**
 * A long page with a sidebar on each side, both from anywhere. Up and down
 * scrolls the page; sideways opens the sidebar on that side.
 */
export function WithScroll() {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const left = useSidebar({
    side: 'left',
    width: WIDTH,
    open: leftOpen,
    onOpenChange: setLeftOpen,
    enabled: !rightOpen,
  });
  const right = useSidebar({
    side: 'right',
    width: WIDTH,
    open: rightOpen,
    onOpenChange: setRightOpen,
    enabled: !leftOpen,
  });
  useStageStatus(
    left.dragging
      ? 'left · dragging'
      : right.dragging
        ? 'right · dragging'
        : scrolling
          ? 'scrolling'
          : leftOpen
            ? 'left · open'
            : rightOpen
              ? 'right · open'
              : undefined,
  );

  return (
    <>
      <div
        className="absolute inset-0 overflow-y-auto"
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
      </div>
      <motion.div
        className="absolute inset-0 bg-black/40"
        style={{
          opacity: left.progress,
          pointerEvents: leftOpen ? 'auto' : 'none',
        }}
        onClick={() => left.setOpen(false)}
      />
      <motion.div
        className="absolute inset-0 bg-black/40"
        style={{
          opacity: right.progress,
          pointerEvents: rightOpen ? 'auto' : 'none',
        }}
        onClick={() => right.setOpen(false)}
      />
      <motion.aside
        className="absolute inset-y-0 left-0 flex flex-col gap-2 bg-sidebar p-4 text-sm shadow-xl"
        style={{ width: WIDTH, x: left.x }}
      >
        <span className="font-medium">Left</span>
      </motion.aside>
      <motion.aside
        className="absolute inset-y-0 right-0 flex flex-col gap-2 bg-sidebar p-4 text-sm shadow-xl"
        style={{ width: WIDTH, x: right.x }}
      >
        <span className="font-medium">Right</span>
      </motion.aside>
    </>
  );
}
