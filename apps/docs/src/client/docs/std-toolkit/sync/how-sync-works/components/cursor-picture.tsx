import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  MOVE,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * How a device's copy keeps up, by the update key alone. On the left, the
 * Backend's tasks, each stamped with the `_u` its last save gave it; on
 * the right, this device's copy, and its cursor: the newest `_u` it has.
 * The first pull asks for everything after nothing and gets all three.
 * Then the Backend saves an edit to one task, which takes a new, larger
 * `_u`. The next pull asks for what is after the cursor and gets only
 * that task. Last, an old copy of the same task turns up from elsewhere:
 * its `_u` is smaller than the one held, so it is ignored. A pull is a
 * label in the accent crossing the gap; the rows it brings fade in once it
 * lands. Each task keeps its own line in both lists, and an edit changes
 * the line in place, so nothing reorders or grows.
 */

type Row = { readonly id: string; readonly title: string; readonly u: number };

type Step = {
  readonly backend: ReadonlyArray<Row>;
  readonly device: ReadonlyArray<Row>;
  readonly cursor: number | null;
  /** A pull crossing to the device, and the cursor it asks after. */
  readonly pull?: string;
  readonly stale?: boolean;
  readonly caption: string;
};

const PLAN = { id: 't1', title: 'Plan the week', u: 1 };
const WATER = { id: 't2', title: 'Water the plants', u: 2 };
const CALL = { id: 't3', title: 'Call home', u: 3 };
const EDITED = { id: 't1', title: 'Plan the month', u: 4 };

/** Each task keeps its own line; an edit changes the line in place. */
const SLOTS = ['t1', 't2', 't3'];
const FIRST = [PLAN, WATER, CALL];

const STEPS: ReadonlyArray<Step> = [
  {
    backend: [PLAN, WATER, CALL],
    device: [],
    cursor: null,
    caption:
      'Every save on the Backend stamps the task with a new _u, and newer is larger.',
  },
  {
    backend: [PLAN, WATER, CALL],
    device: [PLAN, WATER, CALL],
    cursor: 3,
    pull: 'after —',
    caption:
      'The first pull asks for everything. The cursor moves to the newest _u it got, u3.',
  },
  {
    backend: [EDITED, WATER, CALL],
    device: [PLAN, WATER, CALL],
    cursor: 3,
    caption: 'An edit on the Backend saves t1 again, with a larger _u: u4.',
  },
  {
    backend: [EDITED, WATER, CALL],
    device: [EDITED, WATER, CALL],
    cursor: 4,
    pull: 'after u3',
    caption: 'The next pull asks only for what is after u3, and gets just t1.',
  },
  {
    backend: [EDITED, WATER, CALL],
    device: [EDITED, WATER, CALL],
    cursor: 4,
    stale: true,
    caption:
      'An old copy of t1 at u1 turns up. Its _u is smaller, so it is ignored.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

function Rows({
  rows,
  late = false,
  flash,
}: {
  readonly rows: ReadonlyArray<Row>;
  /** New rows wait for the pull bringing them. */
  readonly late?: boolean;
  readonly flash?: number;
}) {
  return (
    <div className="relative">
      <ul className="space-y-1">
        {SLOTS.map((id, index) => {
          const row = rows.find((each) => each.id === id);
          const shown = row ?? FIRST[index]!;
          return (
            <motion.li
              key={id}
              initial={false}
              animate={row ? { opacity: 1, y: 0 } : { opacity: 0, y: 3 }}
              transition={
                row ? { ...ENTER, delay: late ? MOVE.duration : 0 } : EXIT
              }
              aria-hidden={!row}
              className="grid rounded border border-border px-1.5 text-[10.5px] leading-[20px]"
            >
              <AnimatePresence initial={false}>
                <motion.span
                  key={shown.u}
                  className="flex min-w-0 items-center gap-1.5 [grid-area:1/1]"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { ...ENTER, delay: late ? MOVE.duration : 0 },
                  }}
                  exit={{ opacity: 0, transition: EXIT }}
                >
                  <span className="min-w-0 flex-1 truncate">{shown.title}</span>
                  <span className="shrink-0 rounded bg-muted px-1 font-mono text-[9.5px] text-muted-foreground">
                    u{shown.u}
                  </span>
                </motion.span>
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>
      <Flash at={flash} />
    </div>
  );
}

const pill =
  'absolute inset-x-0 mx-auto w-fit rounded-full border bg-background px-1.5 text-center font-mono text-[9.5px] leading-[14px]';

export function CursorPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="px-3 py-8 sm:px-8">
        <div className="mx-auto grid max-w-md grid-cols-[1fr_3.75rem_1fr] gap-2 sm:grid-cols-[1fr_6rem_1fr]">
          <div className="min-w-0 rounded-lg border border-border bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <p className="mb-1.5 text-[11px] font-medium">Backend</p>
            <Rows
              rows={now.backend}
              flash={step === 2 ? round * 10 + 2 : undefined}
            />
          </div>
          <div className="relative">
            <AnimatePresence>
              {now.pull && (
                <motion.span
                  key={`${round}-${step}`}
                  initial={{ opacity: 0, x: '-60%' }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    transition: {
                      x: MOVE,
                      opacity: { duration: 0.15, ease: 'easeOut' },
                    },
                  }}
                  exit={{ opacity: 0, transition: EXIT }}
                  className={`${pill} top-8 border-(--field-accent) text-(--field-accent)`}
                >
                  pull →
                  <br />
                  {now.pull}
                </motion.span>
              )}
              {now.stale && (
                <motion.span
                  key={`stale-${round}`}
                  initial={{ opacity: 0, x: '-40%' }}
                  animate={{ opacity: 1, x: 0, transition: ENTER }}
                  exit={{ opacity: 0, transition: EXIT }}
                  className={`${pill} top-8 border-dashed border-(--field-accent) text-(--field-accent) line-through`}
                >
                  t1 u1
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="min-w-0 rounded-lg border border-border bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <p className="mb-1.5 flex items-baseline justify-between gap-1 text-[11px] font-medium">
              <span className="truncate">Device</span>
              <span className="shrink-0 font-mono text-[9.5px] font-normal text-muted-foreground">
                cursor {now.cursor === null ? '—' : `u${now.cursor}`}
              </span>
            </p>
            <Rows rows={now.device} late={now.pull !== undefined} />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
