import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Roll,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A task with a versioned status inside it. Each carries its own version.
 * Status gets a v2; a read upgrades only the status, from 'todo' at v1 to
 * 'open' at v2, and the task around it stays v1. The task's shape still
 * changed: what it reads as is a transitive change.
 */

type Step = { readonly upgraded: boolean; readonly rule: string };

const STEPS: ReadonlyArray<Step> = [
  { upgraded: false, rule: 'Task v1, holding a Status at v1' },
  { upgraded: false, rule: "Status gets v2: 'todo' is now 'open'" },
  { upgraded: true, rule: 'a read upgrades the status on its own' },
  { upgraded: true, rule: 'Task is still v1: a transitive change' },
];
const DURATIONS = [1600, 1800, 1800, 2200];

function Badge({ value }: { readonly value: string }) {
  return (
    <span className="inline-grid rounded bg-foreground px-1 font-mono text-[10px] text-background">
      <Roll value={value} />
    </span>
  );
}

export function NestedPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div
        className={`relative w-full max-w-64 rounded-lg border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-300 ${step === 3 ? 'border-foreground/40' : 'border-border'}`}
      >
        <p className="mb-2 flex items-center gap-1.5 text-[12px]">
          <span className="font-medium">Task</span>
          <Badge value="v1" />
        </p>
        <dl className="space-y-1.5 font-mono text-[11px]">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">title</dt>
            <dd>'Plan the week'</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">status</dt>
            <dd className="relative flex items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5">
              <Roll value={now.upgraded ? "'open'" : "'todo'"} />
              <Badge value={now.upgraded ? 'v2' : 'v1'} />
              <Flash {...(now.upgraded ? { at: round * 10 + 2 } : {})} />
            </dd>
          </div>
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
