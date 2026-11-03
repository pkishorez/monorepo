import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * Two deploys meet the deploy guard. On the left, the versions last
 * shipped; on the right, the ones this deploy brings. The first adds a
 * version: the guard lets it through and the table is set up. The second
 * edits a version that already shipped: the guard stops the deploy, and
 * the table is never touched.
 */

type Version = { readonly name: string; readonly edited?: boolean };

type Step = {
  readonly next: ReadonlyArray<Version>;
  readonly verdict?: { readonly ok: boolean; readonly text: string };
  readonly table: string;
};

const SHIPPED: ReadonlyArray<Version> = [{ name: 'v1' }, { name: 'v2' }];

const STEPS: ReadonlyArray<Step> = [
  {
    next: [{ name: 'v1' }, { name: 'v2' }, { name: 'v3' }],
    table: 'waiting for the guard',
  },
  {
    next: [{ name: 'v1' }, { name: 'v2' }, { name: 'v3' }],
    verdict: { ok: true, text: 'v3 added: every stored row still reads' },
    table: 'set up at v3',
  },
  {
    next: [{ name: 'v1' }, { name: 'v2', edited: true }],
    table: 'waiting for the guard',
  },
  {
    next: [{ name: 'v1' }, { name: 'v2', edited: true }],
    verdict: { ok: false, text: 'v2 changed after it shipped' },
    table: 'untouched',
  },
];
const DURATIONS = [1300, 2200, 1300, 2400];

function Versions({
  title,
  versions,
}: {
  readonly title: string;
  readonly versions: ReadonlyArray<Version>;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {title}
      </p>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <span className="mr-0.5 text-[12px] font-medium">Task</span>
        <AnimatePresence initial={false} mode="popLayout">
          {versions.map((version) => (
            <motion.span
              key={`${version.name}${version.edited ? '*' : ''}`}
              layout="position"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
              className={`rounded px-1 font-mono text-[10px] ${version.edited ? 'border border-red-500 text-red-600 dark:text-red-400' : 'bg-foreground text-background'}`}
            >
              {version.name}
              {version.edited && ' edited'}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function GuardPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <div className="grid grid-cols-2 gap-3">
          <Versions title="Last shipped" versions={SHIPPED} />
          <Versions title="This deploy" versions={now.next} />
        </div>
        <div className="mt-4 flex h-8 items-center justify-center">
          <AnimatePresence mode="wait">
            {now.verdict ? (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: now.verdict.ok ? 0 : [0, -5, 5, -3, 3, 0],
                  transition: now.verdict.ok ? ENTER : { duration: 0.4 },
                }}
                exit={{ opacity: 0, transition: EXIT }}
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${now.verdict.ok ? 'border-border' : 'border-red-500 text-red-600 dark:text-red-400'}`}
              >
                deploy guard: {now.verdict.text}
              </motion.span>
            ) : (
              <motion.span
                key={`${round}-${step}-wait`}
                className="font-mono text-[11px] text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                deploy guard: comparing…
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mx-auto h-4 w-px bg-border" />
        <div className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-[12px]">
          <span className="font-medium">board</span>{' '}
          <span className="font-mono text-[11px] text-muted-foreground">
            table: {now.table}
          </span>
        </div>
      </div>
    </div>
  );
}
