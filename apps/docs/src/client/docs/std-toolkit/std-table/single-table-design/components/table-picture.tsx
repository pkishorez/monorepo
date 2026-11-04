import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * One table, filling up with three kinds of thing. The table keeps a
 * place for every row, in key order, from the start, and each row
 * arrives in its own place, its partition key lit: the key starts with
 * the kind's name, so a board, the tasks on it and the settings never
 * mix. The two tasks share one partition and sit together, ordered by
 * their sort key. Nothing below a new row moves, and the table never
 * grows.
 */

type Row = {
  readonly pk: string;
  readonly sk: string;
  readonly value: string;
};

/** Every row, in the order the table keeps them: by pk, then sk. */
const ROWS: ReadonlyArray<Row> = [
  { pk: 'Board', sk: 'work', value: "name: 'Work'" },
  { pk: 'Settings', sk: 'single', value: "theme: 'dark'" },
  { pk: 'Task#work', sk: 't1', value: "title: 'Plan'" },
  { pk: 'Task#work', sk: 't2', value: "title: 'Ship'" },
];

/** Which row arrives at each step after the first, by its place. */
const ARRIVALS = [2, 0, 3, 1];

const CAPTIONS = [
  'One table, empty. Boards, tasks and settings will all be kept in it.',
  'A task arrives. Its partition key starts with its kind, Task, then its board.',
  'A board arrives. Its key starts with Board, so it lands apart from the tasks.',
  'A second task on work shares the first one’s partition, ordered by sort key.',
  'Settings arrive under a key of their own. Three kinds, one table, never mixed.',
];

const columns =
  'grid grid-cols-[5.5rem_3rem_1fr] gap-2 sm:grid-cols-[6rem_3.5rem_1fr] sm:gap-3';

export function TablePicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step } = walk;
  const arrived = ARRIVALS.slice(0, step);
  const newest = step > 0 ? ARRIVALS[step - 1] : undefined;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-border bg-background font-mono text-[11.5px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div
            className={`${columns} border-b border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground`}
          >
            <span>pk</span>
            <span>sk</span>
            <span>value</span>
          </div>
          <ul>
            {ROWS.map((row, index) => {
              const there = arrived.includes(index);
              return (
                <motion.li
                  key={`${row.pk}-${row.sk}`}
                  initial={false}
                  animate={there ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
                  transition={there ? ENTER : EXIT}
                  aria-hidden={!there}
                  className={`${columns} border-b border-border/60 px-3 py-2 last:border-b-0`}
                >
                  <span
                    className={`truncate transition-colors duration-500 ${index === newest ? 'font-medium text-(--field-accent)' : 'text-muted-foreground'}`}
                  >
                    {row.pk}
                  </span>
                  <span>{row.sk}</span>
                  <span className="truncate">{row.value}</span>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </div>
    </Walkthrough>
  );
}
