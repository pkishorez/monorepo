import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 200;

/** A sidebar on the right that opens from a Swipe left anywhere, and closes from a Swipe right. */
export function RightSide() {
  const sidebar = useSidebar({ side: 'right', width: WIDTH });
  useStageStatus(
    sidebar.dragging ? 'dragging' : sidebar.open ? 'open' : undefined,
  );

  return (
    <>
      <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
        Swipe left
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
        className="absolute inset-y-0 right-0 flex flex-col gap-2 bg-sidebar p-4 text-sm shadow-xl"
        style={{ width: WIDTH, x: sidebar.x }}
      >
        <span className="font-medium">Sidebar</span>
        <span className="text-muted-foreground">Swipe right to close</span>
      </motion.aside>
    </>
  );
}
