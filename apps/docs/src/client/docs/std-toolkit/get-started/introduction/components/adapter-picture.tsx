import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * One table on four databases. On the left, the one line that picks the
 * adapter; on the right, the table and its rows. Each step swaps the
 * adapter, and the database's name over the table changes with it. The
 * rows never move: the same program reads the same tasks wherever they
 * are kept.
 */

const ADAPTERS = [
  { code: 'Memory.make(table)', where: 'memory' },
  { code: 'IDB.make(table, …)', where: 'IndexedDB' },
  { code: 'SQLite.make(table, …)', where: 'SQLite' },
  { code: 'DynamoDB.make(table, …)', where: 'DynamoDB' },
] as const;
const DURATIONS = [1800, 1800, 1800, 1800];

const ROWS = [
  { entity: 'Task', key: 'work · t1', field: "'Plan the week'" },
  { entity: 'Task', key: 'work · t2', field: "'Call home'" },
  { entity: 'Board', key: 'work', field: "'Work'" },
];

function Swap({
  value,
  className,
}: {
  readonly value: string;
  readonly className?: string;
}) {
  return (
    <span className={`relative inline-grid overflow-hidden ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: ENTER }}
          exit={{ opacity: 0, y: -10, transition: EXIT }}
          className="whitespace-nowrap"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function AdapterPicture() {
  const [ref, step] = useSteps(DURATIONS, 0);
  const now = ADAPTERS[step]!;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto grid max-w-lg items-center gap-5 sm:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-[11px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="text-muted-foreground">// the one line that changes</p>
          <p>
            <span className="text-muted-foreground">const db = </span>
            <Swap value={now.code} />
          </p>
          <p className="mt-2 text-muted-foreground">// everything else stays</p>
          <p>task.insert(…)</p>
          <p>task.query('primary', …)</p>
        </div>
        <div className="rounded-lg border border-border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-[12px]">
            <span className="font-medium">board</span>
            <span className="text-muted-foreground">on</span>
            <Swap value={now.where} className="font-medium" />
          </p>
          <ul className="divide-y divide-border font-mono text-[11px]">
            {ROWS.map((row) => (
              <li key={row.key} className="flex items-center gap-2 px-3 py-1.5">
                <span className="w-10 text-foreground">{row.entity}</span>
                <span className="w-16 text-muted-foreground">{row.key}</span>
                <span className="truncate">{row.field}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
