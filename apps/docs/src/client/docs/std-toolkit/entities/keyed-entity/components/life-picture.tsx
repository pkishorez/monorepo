import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Message,
  Roll,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * One task's life as an Entity: its value, and its meta under it. Each
 * call drops in above it; then only what the call changed rolls. Every
 * write moves the update stamp `_u` forward. A delete sets `_d` and keeps
 * the value, so restore can bring it back.
 */

type Step = {
  readonly call?: string;
  readonly done: boolean;
  readonly u: string;
  readonly deleted: boolean;
  readonly writes: number;
};

const STEPS: ReadonlyArray<Step> = [
  { call: 'insert', done: false, u: '01J8…A1', deleted: false, writes: 1 },
  {
    call: 'getAndUpdate { done: true }',
    done: false,
    u: '01J8…A1',
    deleted: false,
    writes: 1,
  },
  { done: true, u: '01J8…B7', deleted: false, writes: 2 },
  { call: 'delete', done: true, u: '01J8…B7', deleted: false, writes: 2 },
  { done: true, u: '01J8…C2', deleted: true, writes: 3 },
  { call: 'restore', done: true, u: '01J8…C2', deleted: true, writes: 3 },
  { done: true, u: '01J8…D9', deleted: false, writes: 4 },
];
const DURATIONS = [1300, 900, 1500, 900, 1700, 900, 1700];

export function LifePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-72">
        <div className="flex h-9 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {now.call && (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, y: 14, transition: EXIT }}
              >
                <Message>{now.call}</Message>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div
          className={`relative mt-3 rounded-xl border bg-background p-4 font-mono text-[11.5px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-style,opacity] duration-300 ${now.deleted ? 'border-dashed border-muted-foreground/60 opacity-70' : 'border-border'}`}
        >
          <p className="mb-1 font-sans text-[11px] font-medium text-muted-foreground">
            value
          </p>
          <p>
            <span className="text-muted-foreground">taskId </span>'t1'
          </p>
          <p>
            <span className="text-muted-foreground">title </span>'Plan the week'
          </p>
          <p>
            <span className="text-muted-foreground">done </span>
            <Roll value={String(now.done)} />
          </p>
          <p className="mt-3 mb-1 font-sans text-[11px] font-medium text-muted-foreground">
            meta
          </p>
          <p>
            <span className="text-muted-foreground">_u </span>
            <Roll value={now.u} />
          </p>
          <p>
            <span className="text-muted-foreground">_d </span>
            <Roll value={String(now.deleted)} />
          </p>
          <Flash at={round * 10 + now.writes} />
        </div>
      </div>
    </div>
  );
}
