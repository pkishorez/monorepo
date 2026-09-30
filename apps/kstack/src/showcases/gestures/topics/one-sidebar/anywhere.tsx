import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 200;

/** A sidebar that opens from a Swipe right anywhere, and closes from a Swipe left anywhere. */
export function Anywhere() {
  const sidebar = useSidebar({ side: 'left', width: WIDTH });
  useStageStatus(
    sidebar.dragging ? 'dragging' : sidebar.open ? 'open' : undefined,
  );

  return (
    <>
      <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
        Swipe right
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
        className="absolute inset-y-0 left-0 flex flex-col gap-2 bg-sidebar p-4 text-sm shadow-xl"
        style={{ width: WIDTH, x: sidebar.x }}
      >
        <span className="font-medium">Sidebar</span>
        <span className="text-muted-foreground">Swipe left to close</span>
      </motion.aside>
    </>
  );
}
