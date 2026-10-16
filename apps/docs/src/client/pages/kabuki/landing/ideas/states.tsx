import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, SPRING, useSteps } from '../../../../components/index.ts';

/*
 * States decide what renders: a Profile is Idle, then Loading, then Ready.
 * Its States sit in a row, the current one marked, a line from it down to
 * what the Profile draws. Each move goes in order: what the old State drew
 * leaves, the mark moves, and what the new State draws arrives. The
 * Loading State's fetch Worker is there only while it is Loading.
 */

const STATES = ['Idle', 'Loading', 'Ready'] as const;
const STEPS = [1800, 1600, 2600];

export function States() {
  const [ref, step] = useSteps(STEPS, 2);
  const current = STATES[step]!;
  return (
    <div ref={ref} className="w-full max-w-72">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Profile</span>
        <div className="flex gap-1">
          {STATES.map((state) => (
            <span
              key={state}
              className={`relative rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors delay-150 duration-200 ${
                state === current ? 'text-background' : 'text-muted-foreground'
              }`}
            >
              {state === current && (
                <motion.span
                  layoutId="profile-state"
                  // Waits for what the old State drew to leave.
                  transition={{ ...SPRING, delay: EXIT.duration }}
                  className="absolute inset-0 rounded-full bg-foreground"
                >
                  <motion.span
                    layout
                    className="absolute top-full left-1/2 h-3 w-px bg-foreground"
                  />
                </motion.span>
              )}
              <span className="relative">{state}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 grid h-32 overflow-hidden rounded-lg border border-border bg-background p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 6 }}
            // Arrives once the mark has landed.
            animate={{ opacity: 1, y: 0, transition: { ...ENTER, delay: 0.3 } }}
            exit={{ opacity: 0, y: -4, transition: EXIT }}
            className="flex flex-col justify-center"
          >
            {current === 'Idle' && <Idle />}
            {current === 'Loading' && <Loading />}
            {current === 'Ready' && <Ready />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Idle() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="text-sm text-muted-foreground">No profile open</span>
      <span className="rounded-md border border-border px-3 py-1 text-xs font-medium">
        Open profile
      </span>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="size-10 shrink-0 rounded-full bg-muted" />
        <div className="flex flex-1 flex-col gap-2">
          <span className="h-2.5 w-28 rounded-full bg-muted" />
          <span className="h-2.5 w-16 rounded-full bg-muted" />
        </div>
      </div>
      <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-foreground motion-reduce:animate-none" />
        Worker fetch, running
      </span>
    </div>
  );
}

function Ready() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-sm font-medium text-background">
        AL
      </span>
      <div className="flex flex-col">
        <span className="text-sm font-medium">Ada Lovelace</span>
        <span className="text-xs text-muted-foreground">@ada · 3 projects</span>
      </div>
    </div>
  );
}
