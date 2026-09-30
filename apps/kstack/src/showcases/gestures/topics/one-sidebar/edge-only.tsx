import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 280;

/** A sidebar that opens only from a Swipe that starts within 24px of the left edge of the screen. */
export function EdgeOnly() {
  const sidebar = useSidebar({ side: 'left', width: WIDTH, edge: 24 });
  useStageStatus(
    sidebar.dragging ? 'dragging' : sidebar.open ? 'open' : undefined,
  );

  return (
    <>
      <div className="absolute inset-y-0 left-0 w-6 bg-primary/10" />
      <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
        Swipe right from the edge
      </div>
      <motion.div
        className="absolute inset-0 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: sidebar.open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.aside
        className="absolute inset-y-0 left-0 flex flex-col gap-2 bg-sidebar p-4 pt-[max(1rem,env(safe-area-inset-top))] text-sm shadow-xl"
        style={{ width: WIDTH, x: sidebar.x }}
      >
        <span className="font-medium">Sidebar</span>
        <span className="text-muted-foreground">Swipe left to close</span>
      </motion.aside>
    </>
  );
}
