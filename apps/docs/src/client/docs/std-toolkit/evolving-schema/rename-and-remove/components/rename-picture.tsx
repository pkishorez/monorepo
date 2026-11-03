import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Roll,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A v1 task read by release 2, one change at a time. First `notes` is
 * removed: its line fades and closes. Then `colour` is renamed: only its
 * name changes, and its value, 'blue', stays where it was. Last the
 * task's version moves to v2.
 */

type Step = {
  readonly notes: boolean;
  readonly renamed: boolean;
  readonly version: string;
  readonly rule: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    notes: true,
    renamed: false,
    version: 'v1',
    rule: 'a task saved by release 1',
  },
  {
    notes: false,
    renamed: false,
    version: 'v1',
    rule: 'notes: null removes the field',
  },
  {
    notes: false,
    renamed: true,
    version: 'v1',
    rule: 'colour → color: the value comes along',
  },
  { notes: false, renamed: true, version: 'v2', rule: 'read as v2' },
];
const DURATIONS = [1500, 1700, 1900, 2000];

export function RenamePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
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
            <dt className="text-muted-foreground">title</dt>
            <dd>'Plan the week'</dd>
          </div>
          <div className="flex gap-2">
            <dt className="inline-grid text-muted-foreground">
              <Roll value={now.renamed ? 'color' : 'colour'} />
            </dt>
            <dd>'blue'</dd>
          </div>
          <AnimatePresence initial={false}>
            {now.notes && (
              <motion.div
                key={`notes-${round}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 20, transition: ENTER }}
                exit={{
                  opacity: 0,
                  height: 0,
                  transition: { duration: 0.35, ease: [0.4, 0, 1, 1] },
                }}
                className="flex gap-2 overflow-hidden"
              >
                <dt className="text-muted-foreground">notes</dt>
                <dd>'Ask about Friday'</dd>
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
