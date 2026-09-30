import { ArrowDownIcon, LoaderCircleIcon } from '@kstackz/ui-toolkit/lucide';
import { usePullToRefresh, useSidebar } from '@kstackz/use-gesture';
import { motion, useMotionValueEvent, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const DISTANCE = 72;
const WIDTH = 200;

/**
 * A list that pulls to refresh, with a sidebar that opens from a Swipe right
 * anywhere. Each Swipe locks to the axis the finger moved along most in its
 * first 10px, so a diagonal drag goes to one of them, never both.
 */
export function WithSidebar() {
  const [rows, setRows] = useState(() =>
    Array.from({ length: 20 }, (_, i) => 20 - i),
  );
  const sidebar = useSidebar({ side: 'left', width: WIDTH });
  const pull = usePullToRefresh({
    distance: DISTANCE,
    enabled: !sidebar.open,
    onRefresh: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setRows((rows) => [rows[0]! + 2, rows[0]! + 1, ...rows]);
    },
  });
  const [percent, setPercent] = useState(0);
  useMotionValueEvent(pull.progress, 'change', (p) =>
    setPercent(Math.round(p * 10) * 10),
  );
  const rotate = useTransform(pull.progress, [0.8, 1], [0, 180]);
  useStageStatus(
    sidebar.dragging
      ? 'sidebar · dragging'
      : pull.state === 'pulling'
        ? `pulling ${percent}%`
        : pull.state !== 'idle'
          ? pull.state
          : sidebar.open
            ? 'sidebar · open'
            : undefined,
  );

  return (
    <>
      <motion.div
        className="absolute inset-x-0 top-0 flex items-center justify-center"
        style={{ height: DISTANCE, opacity: pull.progress }}
      >
        <motion.div
          className="grid size-8 place-items-center rounded-full bg-muted"
          style={{ rotate: pull.state === 'refreshing' ? 0 : rotate }}
        >
          {pull.state === 'refreshing' ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <ArrowDownIcon className="size-4" />
          )}
        </motion.div>
      </motion.div>
      <motion.div
        className="absolute inset-0 overflow-y-auto bg-card"
        style={{ y: pull.y }}
      >
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((n) => (
            <li key={n} className="px-4 py-3 text-sm">
              Row {n}
            </li>
          ))}
        </ul>
      </motion.div>
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
