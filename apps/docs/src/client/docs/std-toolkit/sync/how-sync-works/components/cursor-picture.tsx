import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * How a device's copy keeps up, by the update key alone. On the left, the
 * Backend's tasks, each stamped with the `_u` its last save gave it; on
 * the right, this device's copy, and its cursor: the newest `_u` it has.
 * The first pull asks for everything after nothing and gets all three.
 * Then the Backend saves an edit to one task, which takes a new, larger
 * `_u`. The next pull asks for what is after the cursor and gets only
 * that task. Last, an old copy of the same task turns up from elsewhere:
 * its `_u` is smaller than the one held, so it is ignored.
 */

type Row = { readonly id: string; readonly title: string; readonly u: number };

type Step = {
  readonly backend: ReadonlyArray<Row>;
  readonly device: ReadonlyArray<Row>;
  readonly cursor: number | null;
  readonly moving?: { readonly label: string; readonly to: 'device' };
  readonly stale?: boolean;
  readonly line: string;
};

const PLAN = { id: 't1', title: 'Plan the week', u: 1 };
const WATER = { id: 't2', title: 'Water the plants', u: 2 };
const CALL = { id: 't3', title: 'Call home', u: 3 };
const EDITED = { id: 't1', title: 'Plan the month', u: 4 };

const STEPS: ReadonlyArray<Step> = [
  {
    backend: [PLAN, WATER, CALL],
    device: [],
    cursor: null,
    line: 'every save stamps the task with a new _u',
  },
  {
    backend: [PLAN, WATER, CALL],
    device: [],
    cursor: null,
    moving: { label: 'after: nothing', to: 'device' },
    line: 'the first pull asks for everything',
  },
  {
    backend: [PLAN, WATER, CALL],
    device: [PLAN, WATER, CALL],
    cursor: 3,
    line: 'the cursor moves to the newest _u it got',
  },
  {
    backend: [WATER, CALL, EDITED],
    device: [PLAN, WATER, CALL],
    cursor: 3,
    line: 'an edit on the Backend: t1 gets a larger _u',
  },
  {
    backend: [WATER, CALL, EDITED],
    device: [PLAN, WATER, CALL],
    cursor: 3,
    moving: { label: 'after: u3', to: 'device' },
    line: 'the next pull asks only for what is after u3',
  },
  {
    backend: [WATER, CALL, EDITED],
    device: [EDITED, WATER, CALL],
    cursor: 4,
    line: 'one task comes back, and replaces the older copy',
  },
  {
    backend: [WATER, CALL, EDITED],
    device: [EDITED, WATER, CALL],
    cursor: 4,
    stale: true,
    line: 'an old t1 at u1 turns up: smaller _u, ignored',
  },
];
const DURATIONS = [1500, 1200, 1700, 1800, 1300, 1800, 2400];

function Rows({
  rows,
  flash,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly flash?: number;
}) {
  return (
    <ul className="relative min-h-[5.25rem] space-y-1">
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((row) => (
          <motion.li
            key={`${row.id}-${row.u}`}
            layout="position"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0, transition: ENTER }}
            exit={{ opacity: 0, transition: EXIT }}
            className="flex items-center gap-1.5 rounded border border-border px-1.5 text-[10.5px] leading-[20px]"
          >
            <span className="min-w-0 flex-1 truncate">{row.title}</span>
            <span className="shrink-0 rounded bg-muted px-1 font-mono text-[9.5px] text-muted-foreground">
              u{row.u}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
      <Flash {...(flash ? { at: flash } : {})} />
    </ul>
  );
}

export function CursorPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 5);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="px-3 py-8 sm:px-8">
      <div className="mx-auto grid max-w-md grid-cols-[1fr_3.5rem_1fr] gap-2 sm:grid-cols-[1fr_6rem_1fr]">
        <div className="min-w-0 rounded-lg border border-border bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="mb-1.5 text-[11px] font-medium">Backend</p>
          <Rows
            rows={now.backend}
            {...(step === 3 ? { flash: round * 10 + 3 } : {})}
          />
        </div>
        <div className="relative">
          <AnimatePresence>
            {now.moving && (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, x: '-30%' }}
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] },
                }}
                exit={{ opacity: 0, transition: EXIT }}
                className="absolute inset-x-0 top-9 mx-auto w-fit rounded-full border border-border bg-background px-1.5 text-center font-mono text-[9.5px] leading-4"
              >
                {now.moving.label} →
              </motion.span>
            )}
            {now.stale && (
              <motion.span
                key={`stale-${round}`}
                initial={{ opacity: 0, x: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0.5],
                  x: [0, 8, -4, 0],
                  transition: { duration: 0.9 },
                }}
                exit={{ opacity: 0, transition: EXIT }}
                className="absolute inset-x-0 top-[4.5rem] mx-auto w-fit rounded-full border border-dashed border-border bg-background px-1.5 font-mono text-[9.5px] leading-4 text-muted-foreground line-through"
              >
                t1 u1
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0 rounded-lg border border-border bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="mb-1.5 flex items-baseline justify-between gap-1 text-[11px] font-medium">
            This device
            <span className="font-mono text-[9.5px] font-normal text-muted-foreground">
              cursor {now.cursor === null ? '—' : `u${now.cursor}`}
            </span>
          </p>
          <Rows
            rows={now.device}
            {...(step === 2 || step === 5 ? { flash: round * 10 + step } : {})}
          />
        </div>
      </div>
      <p className="mt-5 h-4 text-center font-mono text-[11px] text-muted-foreground">
        <AnimatePresence mode="wait">
          <motion.span
            key={`${round}-${step}`}
            className="inline-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: ENTER }}
            exit={{ opacity: 0, transition: EXIT }}
          >
            {now.line}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  );
}
