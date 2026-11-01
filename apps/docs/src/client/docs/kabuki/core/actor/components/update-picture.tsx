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
 * A counter Actor taking Messages one at a time. Each Message drops in
 * above it; then the Update runs, the box flashes, and only the value it
 * changed rolls. Added carries an amount, and the Update adds it. Reset
 * sets it back. Last, an Added whose amount is not a number is refused
 * at the door: it shakes, and the Model stays as it was.
 */

type Step = {
  readonly count: number;
  readonly message?: string;
  readonly refused?: boolean;
  /** The Update that just ran, or why nothing did. */
  readonly rule?: string;
};

const STEPS: ReadonlyArray<Step> = [
  { count: 0 },
  { count: 0, message: 'Added { amount: 1 }' },
  { count: 1, rule: 'count + amount' },
  { count: 1, message: 'Added { amount: 5 }' },
  { count: 6, rule: 'count + amount' },
  { count: 6, message: 'Reset' },
  { count: 0, rule: 'count = 0' },
  { count: 0, message: "Added { amount: 'ten' }" },
  {
    count: 0,
    message: "Added { amount: 'ten' }",
    refused: true,
    rule: 'refused: amount is not a number',
  },
];
const DURATIONS = [1200, 900, 1500, 1000, 1500, 900, 1500, 1000, 2200];
const UPDATES = [2, 4, 6];

export function UpdatePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  const now = STEPS[step]!;
  const updates =
    round * UPDATES.length + UPDATES.filter((at) => at <= step).length;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-10">
      <div className="w-full max-w-72">
        <div className="flex h-10 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {now.message && (
              <motion.span
                key={`${round}-${now.message}-${step - (now.refused ? 1 : 0)}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: now.refused ? [0, -6, 6, -4, 4, 0] : 0,
                  transition: now.refused ? { duration: 0.4 } : ENTER,
                }}
                exit={{
                  opacity: 0,
                  y: now.refused ? -10 : 14,
                  transition: EXIT,
                }}
              >
                <Message
                  className={`transition-colors duration-200 ${
                    now.refused
                      ? 'border-red-500 text-red-600 dark:text-red-400'
                      : ''
                  }`}
                >
                  {now.message}
                </Message>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="relative mt-3 rounded-xl border border-border bg-background p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="text-sm font-medium">Counter</span>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {'{ count: '}
            <Roll value={now.count} className="text-foreground" />
            {' }'}
          </p>
          <Flash at={updates} />
        </div>
        <p
          className={`mt-3 h-4 text-center font-mono text-[11px] transition-colors duration-200 ${
            now.refused
              ? 'text-red-600 dark:text-red-400'
              : 'text-muted-foreground'
          }`}
        >
          <AnimatePresence mode="wait">
            {now.rule && (
              <motion.span
                key={`${round}-${step}`}
                className="inline-block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                {now.rule}
              </motion.span>
            )}
          </AnimatePresence>
        </p>
      </div>
    </div>
  );
}
