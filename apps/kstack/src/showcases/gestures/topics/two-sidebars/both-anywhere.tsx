import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 180;

/**
 * A sidebar on each side, both opening from anywhere: a Swipe right opens the
 * left one, a Swipe left the right one. While one is open the other is off,
 * so the Swipe back only closes it.
 */
export function BothAnywhere() {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
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
        : leftOpen
          ? 'left · open'
          : rightOpen
            ? 'right · open'
            : undefined,
  );

  return (
    <>
      <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
        Swipe left or right
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
