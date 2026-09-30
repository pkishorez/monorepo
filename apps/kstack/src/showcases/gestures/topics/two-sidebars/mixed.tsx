import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 280;

/**
 * A left sidebar that opens only from the left edge of the screen, and a
 * right one that opens from a Swipe left anywhere. Only one is on at a time.
 */
export function Mixed() {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const left = useSidebar({
    side: 'left',
    width: WIDTH,
    edge: 24,
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
      <div className="absolute inset-y-0 left-0 w-6 bg-primary/10" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
        <span>Swipe right from the edge</span>
        <span>Swipe left anywhere</span>
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
        className="absolute inset-y-0 left-0 flex flex-col gap-2 bg-sidebar p-4 pt-[max(1rem,env(safe-area-inset-top))] text-sm shadow-xl"
        style={{ width: WIDTH, x: left.x }}
      >
        <span className="font-medium">Left · from the edge</span>
      </motion.aside>
      <motion.aside
        className="absolute inset-y-0 right-0 flex flex-col gap-2 bg-sidebar p-4 pt-[max(1rem,env(safe-area-inset-top))] text-sm shadow-xl"
        style={{ width: WIDTH, x: right.x }}
      >
        <span className="font-medium">Right · from anywhere</span>
      </motion.aside>
    </>
  );
}
