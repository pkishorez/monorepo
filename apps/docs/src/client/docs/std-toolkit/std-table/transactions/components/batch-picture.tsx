import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Message,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A move, as one batch: insert t1 on home, delete t1 on work. The first
 * time, both land together: t1 shows on home, and work keeps a
 * tombstone. Then a t2 is moved, but home already has a t2, so the insert
 * is refused, and the delete beside it does not land either.
 */

type Step = {
  readonly batch?: 'first' | 'second';
  readonly verdict?: string;
  readonly home: ReadonlyArray<string>;
  readonly work: ReadonlyArray<string>;
};

const STEPS: ReadonlyArray<Step> = [
  { home: [], work: ['t1'] },
  { batch: 'first', home: [], work: ['t1'] },
  {
    batch: 'first',
    verdict: 'both landed, one _u',
    home: ['t1'],
    work: ['t1 deleted'],
  },
  { home: ['t1', 't2'], work: ['t1 deleted', 't2'] },
  { batch: 'second', home: ['t1', 't2'], work: ['t1 deleted', 't2'] },
  {
    batch: 'second',
    verdict: 'home has a t2: nothing landed',
    home: ['t1', 't2'],
    work: ['t1 deleted', 't2'],
  },
];
const DURATIONS = [1100, 1000, 2000, 1000, 1000, 2200];

function Board({
  name,
  rows,
}: {
  readonly name: string;
  readonly rows: ReadonlyArray<string>;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">{name}</p>
      <ul className="min-h-[4.5rem] space-y-1 rounded-xl border border-border bg-background p-2">
        <AnimatePresence initial={false}>
          {rows.map((row) => (
            <motion.li
              key={row}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] ${row.endsWith('deleted') ? 'border-dashed border-muted-foreground/50 text-muted-foreground' : 'border-border'}`}
            >
              {row}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export function BatchPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 2);
  const now = STEPS[step]!;
  const refused = now.batch === 'second' && now.verdict !== undefined;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-sm">
        <div className="flex h-8 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {now.batch && (
              <motion.span
                key={`${round}-${now.batch}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: refused ? [0, -6, 6, -4, 4, 0] : 0,
                  transition: refused ? { duration: 0.4 } : ENTER,
                }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                <Message
                  className={
                    refused
                      ? 'border-red-500 text-red-600 dark:text-red-400'
                      : ''
                  }
                >
                  {now.batch === 'first'
                    ? 'transact [ insert t1 · home, delete t1 · work ]'
                    : 'transact [ insert t2 · home, delete t2 · work ]'}
                </Message>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-2 h-4 text-center font-mono text-[11px] text-muted-foreground">
          {now.verdict ?? ''}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Board name="home" rows={now.home} />
          <Board name="work" rows={now.work} />
        </div>
      </div>
    </div>
  );
}
