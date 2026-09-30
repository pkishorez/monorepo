import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 200;

/**
 * A page with a sideways carousel in it, and a sidebar that opens from a
 * Swipe right anywhere. The carousel keeps a touch while it can still scroll
 * that way; at its start, a Swipe right goes to the sidebar.
 */
export function Carousel() {
  const sidebar = useSidebar({ side: 'left', width: WIDTH });
  const [scrolling, setScrolling] = useState<'page' | 'carousel'>();
  useStageStatus(
    sidebar.dragging
      ? 'The sidebar has the touch'
      : scrolling === 'carousel'
        ? 'The carousel has the touch'
        : scrolling === 'page'
          ? 'The page has the touch'
          : sidebar.open
            ? 'Open'
            : undefined,
  );

  return (
    <>
      <div
        className="absolute inset-0 overflow-y-auto"
        onScroll={() => setScrolling('page')}
        onScrollEnd={() => setScrolling(undefined)}
      >
        <p className="px-4 pt-4 text-xs font-medium text-muted-foreground">
          Featured
        </p>
        <div
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-3"
          onScroll={(event) => {
            event.stopPropagation();
            setScrolling('carousel');
          }}
          onScrollEnd={(event) => {
            event.stopPropagation();
            setScrolling(undefined);
          }}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="grid h-28 w-40 shrink-0 snap-start place-items-center rounded-lg bg-muted text-sm"
            >
              Card {i + 1}
            </div>
          ))}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {Array.from({ length: 30 }, (_, i) => (
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
