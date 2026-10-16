import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Message,
  SPRING,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A door's three States in a row, the one it is in marked, and between
 * each pair the Messages that move it. Messages arrive one at a time: one
 * that the current State has a rule for moves the mark; one it has no
 * rule for, Lock while the door is Open, shakes and is ignored.
 */

const STATES = ['Locked', 'Closed', 'Open'] as const;
type State = (typeof STATES)[number];

const STEPS: ReadonlyArray<{
  readonly state: State;
  readonly message?: string;
  readonly ignored?: boolean;
}> = [
  { state: 'Locked' },
  { state: 'Locked', message: 'Unlocked' },
  { state: 'Closed' },
  { state: 'Closed', message: 'Opened' },
  { state: 'Open' },
  { state: 'Open', message: 'Locked' },
  { state: 'Open', message: 'Locked', ignored: true },
  { state: 'Open', message: 'Shut' },
  { state: 'Closed' },
  { state: 'Closed', message: 'Locked' },
  { state: 'Locked' },
];
const DURATIONS = [1200, 800, 1100, 800, 1100, 800, 1800, 800, 1100, 800, 1600];

export function StatesPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 6);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-10">
      <div className="w-full max-w-80">
        <div className="flex h-10 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {now.message && (
              <motion.span
                key={`${round}-${step - (now.ignored ? 1 : 0)}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: now.ignored ? [0, -6, 6, -4, 4, 0] : 0,
                  transition: now.ignored ? { duration: 0.4 } : ENTER,
                }}
                exit={{ opacity: 0, y: 14, transition: EXIT }}
              >
                <Message
                  className={
                    now.ignored ? 'border-muted-foreground opacity-60' : ''
                  }
                >
                  {now.message}
                </Message>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {STATES.map((state, index) => (
            <div key={state} className="contents">
              {index > 0 && (
                <span aria-hidden className="h-px flex-1 bg-border" />
              )}
              <span
                className={`relative rounded-full border px-3 py-1.5 font-mono text-xs transition-colors duration-200 ${
                  state === now.state
                    ? 'border-transparent text-background'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {state === now.state && (
                  <motion.span
                    layoutId="state-machine-mark"
                    transition={SPRING}
                    className="absolute inset-0 rounded-full bg-foreground"
                  />
                )}
                <span className="relative">{state}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-8 px-6 font-mono text-[10px] text-muted-foreground">
          <span className="text-center">Unlocked → ← Locked</span>
          <span className="text-center">Opened → ← Shut</span>
        </div>
        <p className="mt-5 h-4 text-center text-xs text-muted-foreground">
          <AnimatePresence mode="wait">
            {now.ignored && (
              <motion.span
                key={round}
                className="inline-block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                Open has no rule for Locked, so nothing happens.
              </motion.span>
            )}
          </AnimatePresence>
        </p>
      </div>
    </div>
  );
}
