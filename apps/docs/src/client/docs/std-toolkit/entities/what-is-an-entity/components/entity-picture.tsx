import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Pill,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * An entity, put together. First the shape a task has; then the key that
 * finds one; then the table it lives in. The three join into one entity,
 * `task`, and its calls appear under it. Last, a save gives back an
 * Entity: the value, and the meta the toolkit keeps beside it.
 */

const STEPS = [
  { pieces: 1 },
  { pieces: 2 },
  { pieces: 3 },
  { pieces: 3, joined: true },
  { pieces: 3, joined: true, saved: true },
] as const;
const DURATIONS = [1200, 1200, 1300, 1900, 2600];

function Piece({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: ENTER }}
      exit={{ opacity: 0, transition: EXIT }}
      className="rounded-lg border border-border bg-background px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </p>
      <div className="font-mono text-[11.5px] leading-5">{children}</div>
    </motion.div>
  );
}

export function EntityPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  const now: (typeof STEPS)[number] = STEPS[step]!;
  const joined = 'joined' in now;
  const saved = 'saved' in now;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto grid max-w-xl gap-3 sm:grid-cols-3">
        <AnimatePresence initial={false}>
          {now.pieces >= 1 && (
            <Piece key={`shape-${round}`} label="a shape">
              Task
              <span className="text-muted-foreground"> · v3</span>
            </Piece>
          )}
          {now.pieces >= 2 && (
            <Piece key={`key-${round}`} label="a key">
              boardId
              <span className="text-muted-foreground"> + </span>
              taskId
            </Piece>
          )}
          {now.pieces >= 3 && (
            <Piece key={`table-${round}`} label="a table">
              'board'
            </Piece>
          )}
        </AnimatePresence>
      </div>
      <div className="mx-auto mt-4 flex min-h-[12.5rem] max-w-xl flex-col items-center gap-3">
        <AnimatePresence initial={false}>
          {joined && (
            <motion.div
              key={`entity-${round}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
              className="relative flex flex-wrap items-center justify-center gap-1.5 rounded-xl border-2 border-foreground/80 bg-background px-3 py-2"
            >
              <span className="mr-1 text-sm font-semibold">task</span>
              {['insert', 'get', 'query', 'getAndUpdate', 'delete'].map(
                (call) => (
                  <Pill key={call} className="font-mono text-[10.5px]">
                    {call}
                  </Pill>
                ),
              )}
              <Flash at={saved ? round * 10 + 2 : round * 10 + 1} />
            </motion.div>
          )}
          {saved && (
            <motion.div
              key={`saved-${round}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
              className="grid w-full max-w-sm grid-cols-2 gap-3 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] leading-5"
            >
              <div>
                <p className="mb-0.5 font-sans font-medium text-muted-foreground">
                  value
                </p>
                <p>taskId 't1'</p>
                <p>title 'Plan the week'</p>
                <p>priority 'low'</p>
                <p>done false</p>
              </div>
              <div>
                <p className="mb-0.5 font-sans font-medium text-muted-foreground">
                  meta
                </p>
                <p>_e 'Task'</p>
                <p>_v 'v3'</p>
                <p>_u '01J8…A1'</p>
                <p>_d false</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
