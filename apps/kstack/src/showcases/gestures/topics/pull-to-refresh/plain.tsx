import { ArrowDownIcon, LoaderCircleIcon } from '@kstackz/ui-toolkit/lucide';
import { usePullToRefresh } from '@kstackz/use-gesture';
import { motion, useMotionValueEvent, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const DISTANCE = 72;

/**
 * A list that refreshes when pulled down past 72px of indicator and let go.
 * The fake refresh takes a second, then puts new rows at the top.
 */
export function Plain() {
  const [rows, setRows] = useState(() =>
    Array.from({ length: 20 }, (_, i) => 20 - i),
  );
  const pull = usePullToRefresh({
    distance: DISTANCE,
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
    pull.state === 'pulling'
      ? `pulling ${percent}%`
      : pull.state === 'idle'
        ? undefined
        : pull.state,
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
    </>
  );
}
