import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A page with three tasks, and the IndexedDB store under it that holds
 * them. The page reloads: its list goes blank, and the store does not
 * move. The page opens again; first setup checks the table against the
 * contract the store keeps, then the tasks are read back, all three.
 */

const TASKS = ['Plan the week', 'Water the plants', 'Call home'];

type Step = {
  readonly shown: number;
  readonly blank?: boolean;
  readonly line: string;
  readonly checked?: boolean;
};

const STEPS: ReadonlyArray<Step> = [
  { shown: 3, line: 'three tasks, saved to IndexedDB' },
  { shown: 0, blank: true, line: 'reload: the page starts over' },
  {
    shown: 0,
    line: 'setup compares the table with the stored contract',
    checked: true,
  },
  { shown: 3, line: 'read back: every task is still there', checked: true },
];
const DURATIONS = [1600, 1300, 1700, 2200];

export function ReloadPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-sm">
        <div className="overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
            <span className="size-2 rounded-full bg-border" />
            <span className="size-2 rounded-full bg-border" />
            <span className="size-2 rounded-full bg-border" />
            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
              my-app
            </span>
          </div>
          <motion.ul
            className="min-h-[6.5rem] space-y-1.5 p-3"
            animate={{ opacity: now.blank ? 0.3 : 1 }}
            transition={ENTER}
          >
            <AnimatePresence initial={false}>
              {TASKS.slice(0, now.shown).map((title, index) => (
                <motion.li
                  key={`${round}-${title}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: { ...ENTER, delay: index * 0.08 },
                  }}
                  exit={{ opacity: 0, transition: EXIT }}
                  className="rounded-md border border-border px-2.5 py-1 text-[12px]"
                >
                  {title}
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </div>
        <div className="mx-auto h-6 w-px bg-border" />
        <div className="relative rounded-lg border border-border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="flex items-center justify-between text-[12px]">
            <span className="font-medium">IndexedDB</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              store 'board' · 3 rows
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            _std_contract
            <AnimatePresence initial={false}>
              {now.checked && (
                <motion.span
                  key={`checked-${round}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1, transition: ENTER }}
                  exit={{ opacity: 0, transition: EXIT }}
                  className="rounded bg-foreground px-1 text-background"
                >
                  matches
                </motion.span>
              )}
            </AnimatePresence>
          </p>
          <Flash {...(step === 2 ? { at: round * 10 + 2 } : {})} />
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
