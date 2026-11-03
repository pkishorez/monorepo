import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * One table, filling up with three kinds of thing. Each row arrives in
 * its place by key: the partition key starts with the kind's name, so a
 * board, the tasks on it and the settings never mix. The two tasks share
 * one partition and sit together, ordered by their sort key.
 */

type Row = {
  readonly kind: string;
  readonly pk: string;
  readonly sk: string;
  readonly value: string;
};

const ROWS: ReadonlyArray<Row> = [
  { kind: 'Board', pk: 'Board', sk: 'work', value: "name: 'Work'" },
  { kind: 'Settings', pk: 'Settings', sk: 'single', value: "theme: 'dark'" },
  { kind: 'Task', pk: 'Task#work', sk: 't1', value: "title: 'Plan'" },
  { kind: 'Task', pk: 'Task#work', sk: 't2', value: "title: 'Ship'" },
];

/** The order rows arrive in; the table always shows them sorted by key. */
const ARRIVALS = [2, 0, 3, 1];
const DURATIONS = [900, 1200, 1200, 1200, 2400];

const sorted = (rows: ReadonlyArray<Row>) =>
  [...rows].sort((a, b) =>
    a.pk === b.pk ? (a.sk < b.sk ? -1 : 1) : a.pk < b.pk ? -1 : 1,
  );

export function TablePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  const shown = sorted(ARRIVALS.slice(0, step).map((index) => ROWS[index]!));
  const newest = step > 0 ? ROWS[ARRIVALS[step - 1]!] : undefined;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-border bg-background font-mono text-[11.5px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-[6rem_3.5rem_1fr] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span>pk</span>
          <span>sk</span>
          <span>value</span>
        </div>
        <ul className="min-h-[8.5rem]">
          <AnimatePresence initial={false}>
            {shown.map((row) => (
              <motion.li
                key={`${round}-${row.pk}-${row.sk}`}
                layout="position"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
                transition={{
                  layout: { duration: 0.3, ease: [0.23, 1, 0.32, 1] },
                }}
                className="grid grid-cols-[6rem_3.5rem_1fr] gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
              >
                <span
                  className={`truncate transition-colors duration-500 ${row === newest ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  {row.pk}
                </span>
                <span>{row.sk}</span>
                <span className="truncate">{row.value}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
      <p className="mt-4 text-center font-mono text-[11px] text-muted-foreground">
        {newest
          ? `a ${newest.kind}: its kind starts its pk`
          : 'one table, empty'}
      </p>
    </div>
  );
}
