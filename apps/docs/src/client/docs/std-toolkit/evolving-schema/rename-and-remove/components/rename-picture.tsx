import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Roll,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A task saved at v3, read by release 5, one step at a time. v4 renames
 * `title`: only the name changes, and 'Plan the week' stays where it was.
 * v5 removes `done`: its line closes, and `status` opens in its place,
 * carrying what `done` said. Last a reminder: the stored row has not moved.
 */

type Step = {
  readonly version: string;
  readonly renamed: boolean;
  readonly status: boolean;
  readonly rule: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    version: 'v3',
    renamed: false,
    status: false,
    rule: 'a task saved at v3',
  },
  {
    version: 'v4',
    renamed: true,
    status: false,
    rule: 'v4: title → name, and the value comes along',
  },
  {
    version: 'v5',
    renamed: true,
    status: true,
    rule: 'v5: done is removed; status takes its place',
  },
  {
    version: 'v5',
    renamed: true,
    status: true,
    rule: 'read as v5; the stored row is still v3',
  },
];
const DURATIONS = [1600, 2000, 2200, 2200];

const LINE = { duration: 0.35, ease: [0.4, 0, 1, 1] } as const;

export function RenamePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 2);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-60 rounded-lg border border-border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px]">
          <span className="font-medium">Task</span>
          <span className="inline-grid rounded bg-foreground px-1 font-mono text-[10px] text-background">
            <Roll value={now.version} />
          </span>
        </p>
        <dl className="font-mono text-[11px] leading-5">
          <div className="flex gap-2">
            <dt className="inline-grid text-muted-foreground">
              <Roll value={now.renamed ? 'name' : 'title'} />
            </dt>
            <dd>'Plan the week'</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">priority</dt>
            <dd>'high'</dd>
          </div>
          <AnimatePresence initial={false} mode="popLayout">
            {now.status ? (
              <motion.div
                key={`status-${round}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 20, transition: ENTER }}
                exit={{ opacity: 0, height: 0, transition: LINE }}
                className="flex gap-2 overflow-hidden"
              >
                <dt className="text-muted-foreground">status</dt>
                <dd>'done'</dd>
              </motion.div>
            ) : (
              <motion.div
                key={`done-${round}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 20, transition: ENTER }}
                exit={{ opacity: 0, height: 0, transition: LINE }}
                className="flex gap-2 overflow-hidden"
              >
                <dt className="text-muted-foreground">done</dt>
                <dd>true</dd>
              </motion.div>
            )}
          </AnimatePresence>
        </dl>
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
            {now.rule}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  );
}
