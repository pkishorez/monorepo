import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * Typing a title, paced by coalesce. Every keystroke shows on screen at
 * once. The first is sent straight away; while it is in flight, the next
 * keystrokes wait as one backlog, each replacing the last. When the first
 * request is done, the backlog goes as one request. Four keystrokes, two
 * requests.
 */

type Request = {
  readonly title: string;
  readonly done: boolean;
};

type Step = {
  readonly typed: string;
  readonly requests: ReadonlyArray<Request>;
  readonly backlog?: string;
  readonly line: string;
};

const STEPS: ReadonlyArray<Step> = [
  { typed: '', requests: [], line: 'a title, about to be typed' },
  {
    typed: 'P',
    requests: [{ title: 'P', done: false }],
    line: 'the first change is sent at once',
  },
  {
    typed: 'Pl',
    requests: [{ title: 'P', done: false }],
    backlog: 'Pl',
    line: 'while it is in flight, the next one waits',
  },
  {
    typed: 'Pla',
    requests: [{ title: 'P', done: false }],
    backlog: 'Pla',
    line: 'each new change joins the one waiting',
  },
  {
    typed: 'Plan',
    requests: [{ title: 'P', done: false }],
    backlog: 'Plan',
    line: 'the screen shows every keystroke',
  },
  {
    typed: 'Plan',
    requests: [
      { title: 'P', done: true },
      { title: 'Plan', done: false },
    ],
    line: 'the first is done: what waited goes as one',
  },
  {
    typed: 'Plan',
    requests: [
      { title: 'P', done: true },
      { title: 'Plan', done: true },
    ],
    line: 'four keystrokes, two requests',
  },
];
const DURATIONS = [900, 1100, 700, 700, 1300, 1500, 2200];

export function CoalescePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 5);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-sm space-y-4">
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            On screen
          </p>
          <div className="flex h-9 items-center rounded-lg border border-border bg-background px-3 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {now.typed}
            <span className="ml-px h-4 w-px animate-pulse bg-foreground motion-reduce:animate-none" />
          </div>
        </div>
        <div>
          <p className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            To the Backend
            <AnimatePresence>
              {now.backlog && (
                <motion.span
                  key={`backlog-${round}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: ENTER }}
                  exit={{ opacity: 0, transition: EXIT }}
                  className="rounded border border-dashed border-foreground/40 px-1.5 font-mono text-[10px] font-normal"
                >
                  waiting: '{now.backlog}'
                </motion.span>
              )}
            </AnimatePresence>
          </p>
          <ul className="min-h-[3.75rem] space-y-1.5">
            <AnimatePresence initial={false}>
              {now.requests.map((request, index) => (
                <motion.li
                  key={`${round}-${index}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0, transition: ENTER }}
                  exit={{ opacity: 0, transition: EXIT }}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[11px]"
                >
                  <span>
                    update {'{'} title: '{request.title}' {'}'}
                  </span>
                  <span className="text-muted-foreground">
                    {request.done ? 'saved' : 'in flight…'}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
      <p className="mt-6 h-4 text-center font-mono text-[11px] text-muted-foreground">
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
