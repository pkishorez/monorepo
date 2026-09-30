import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 200;

/** A long page with a sidebar that opens from a Swipe right anywhere on it. */
export function Anywhere() {
  const sidebar = useSidebar({ side: 'left', width: WIDTH });
  const [scrolling, setScrolling] = useState(false);
  useStageStatus(
    sidebar.dragging
      ? 'The sidebar has the touch'
      : scrolling
        ? 'The page has the touch'
        : sidebar.open
          ? 'Open'
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
