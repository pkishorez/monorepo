import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Message,
  Roll,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * One task's life as an Entity: its value, and its meta under it. Each
 * step, a call fades in above the card, and only what it changed rolls,
 * the card lighting as the write lands. Every write moves the update
 * stamp `_u` forward. A delete sets `_d` and keeps the value, drawn
 * dashed, so restore can bring it back. The call sits in a slot of its
 * own height, so nothing below it moves.
 */

type Step = {
  readonly call: string;
  readonly done: boolean;
  readonly u: string;
  readonly deleted: boolean;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    call: 'insert',
    done: false,
    u: '01J8…A1',
    deleted: false,
    caption:
      'insert saves the task. Its meta gets an update stamp, _u, and _d is false.',
  },
  {
    call: 'getAndUpdate { done: true }',
    done: true,
    u: '01J8…B7',
    deleted: false,
    caption: 'getAndUpdate changes only done. Every write moves _u forward.',
  },
  {
    call: 'delete',
    done: true,
    u: '01J8…C2',
    deleted: true,
    caption:
      'delete sets _d to true but keeps the value. The task is now a tombstone.',
  },
  {
    call: 'restore',
    done: true,
    u: '01J8…D9',
    deleted: false,
    caption:
      'restore brings it back as it was: _d is false again, and _u moves on.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

export function LifePicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="grid place-items-center px-4 py-8">
        <div className="w-full max-w-72">
          <div className="grid h-9 place-items-end justify-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                <Message>{now.call}</Message>
              </motion.span>
            </AnimatePresence>
          </div>
          <div
            className={`relative mt-3 rounded-xl border bg-background p-4 font-mono text-[11.5px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,opacity] duration-300 ${now.deleted ? 'border-dashed border-muted-foreground/60 opacity-70' : 'border-border'}`}
          >
            <p className="mb-1 font-sans text-[11px] font-medium text-muted-foreground">
              value
            </p>
            <p>
              <span className="text-muted-foreground">taskId </span>'t1'
            </p>
            <p>
              <span className="text-muted-foreground">title </span>'Plan the
              week'
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
            <Flash at={round * 10 + step + 1} />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
