import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * A move, as one transaction: insert t1 on home, delete t1 on work. The
 * transaction is a small card above the two boards, its two writes one
 * under the other. The first time, both land together: t1 shows on home,
 * and work keeps a tombstone. Then a t2 is moved, but home already has a
 * t2, so the insert is refused, the card shakes, and the delete beside it
 * does not land either. Every row has its place on its board from the
 * start, and both transactions share one place, so nothing grows.
 */

type Step = {
  /** The transaction shown, if any. */
  readonly batch?: 1 | 2;
  /** What came of it, once it has been tried. */
  readonly outcome?: 'landed' | 'refused';
  /** How far the boards have got: 0 before the move, 1 after it, 2 with the t2s. */
  readonly boards: 0 | 1 | 2;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    boards: 0,
    caption:
      'Plan the week, t1, is on the work board. Moving it to home takes two writes.',
  },
  {
    batch: 1,
    boards: 0,
    caption:
      'One transaction holds both: insert t1 on home, and delete it from work.',
  },
  {
    batch: 1,
    outcome: 'landed',
    boards: 1,
    caption:
      'Both land together. t1 is on home, and work keeps a tombstone where it was.',
  },
  {
    boards: 2,
    caption: 'Later, a t2 is on work, and home already has a t2 of its own.',
  },
  {
    batch: 2,
    boards: 2,
    caption: 'A second transaction tries the same move for t2.',
  },
  {
    batch: 2,
    outcome: 'refused',
    boards: 2,
    caption:
      'Home’s t2 refuses the insert, so the delete beside it does not land either. Nothing changed.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

type Row = {
  readonly label: string;
  readonly from: number;
  readonly deleted?: number;
};

const HOME: ReadonlyArray<Row> = [
  { label: 't1', from: 1 },
  { label: 't2', from: 2 },
];
const WORK: ReadonlyArray<Row> = [
  { label: 't1', from: 0, deleted: 1 },
  { label: 't2', from: 2 },
];

function Board({
  name,
  rows,
  at,
  flash,
}: {
  readonly name: string;
  readonly rows: ReadonlyArray<Row>;
  readonly at: number;
  readonly flash?: number;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">{name}</p>
      <ul className="relative flex flex-col gap-1 rounded-xl border border-border bg-background p-2">
        {rows.map((row) => {
          const there = at >= row.from;
          const deleted = row.deleted !== undefined && at >= row.deleted;
          return (
            <motion.li
              key={row.label}
              initial={false}
              animate={there ? { opacity: 1, y: 0 } : { opacity: 0, y: 3 }}
              transition={there ? ENTER : EXIT}
              aria-hidden={!there}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] whitespace-nowrap transition-colors duration-300 ${deleted ? 'border-dashed border-muted-foreground/50 text-muted-foreground' : 'border-border'}`}
            >
              {row.label}
              {deleted && ' · deleted'}
            </motion.li>
          );
        })}
        <Flash at={flash} />
      </ul>
    </div>
  );
}

function Transaction({
  id,
  shown,
  outcome,
}: {
  readonly id: string;
  readonly shown: boolean;
  readonly outcome?: 'landed' | 'refused';
}) {
  const refused = outcome === 'refused';
  return (
    <motion.div
      initial={false}
      animate={
        shown
          ? {
              opacity: 1,
              y: 0,
              x: refused ? [0, -6, 6, -4, 4, 0] : 0,
              transition: refused ? { duration: 0.4 } : ENTER,
            }
          : { opacity: 0, y: -8, transition: EXIT }
      }
      aria-hidden={!shown}
      className={`[grid-area:1/1] rounded-lg border bg-background px-3 py-1.5 font-mono text-[11px] leading-5 transition-colors duration-300 ${refused ? 'border-red-500' : 'border-foreground'}`}
    >
      <p className="flex items-center justify-between gap-3">
        <span className="font-sans text-[12px] font-medium">transact</span>
        <span
          className={`text-[10px] transition-opacity duration-300 ${outcome ? 'opacity-100' : 'opacity-0'} ${refused ? 'text-red-600 dark:text-red-400' : 'text-(--field-accent)'}`}
        >
          {refused ? 'refused' : 'landed'}
        </span>
      </p>
      <p>insert {id} · home</p>
      <p>delete {id} · work</p>
    </motion.div>
  );
}

export function BatchPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  const flash = now.outcome === 'landed' ? round * 10 + step : undefined;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-sm">
          <div className="mx-auto grid w-fit min-w-44">
            <Transaction
              id="t1"
              shown={now.batch === 1}
              {...(now.batch === 1 && now.outcome
                ? { outcome: now.outcome }
                : {})}
            />
            <Transaction
              id="t2"
              shown={now.batch === 2}
              {...(now.batch === 2 && now.outcome
                ? { outcome: now.outcome }
                : {})}
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <Board name="home" rows={HOME} at={now.boards} flash={flash} />
            <Board name="work" rows={WORK} at={now.boards} flash={flash} />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
