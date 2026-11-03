import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Roll,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A versioned value has no fields to hang `_v` on, so it travels in an
 * envelope. A v1 theme arrives as the text 'night'. Read, the migration
 * turns it into the word 'dark'. Saved, it is wrapped in an envelope that
 * carries the latest version beside it.
 */

type Step = {
  readonly text: string;
  readonly wrapped: boolean;
  readonly rule: string;
};

const STEPS: ReadonlyArray<Step> = [
  { text: "'night'", wrapped: false, rule: 'a v1 theme: free text' },
  {
    text: "'dark'",
    wrapped: false,
    rule: "migration v1 → v2: 'night' becomes 'dark'",
  },
  { text: "'dark'", wrapped: true, rule: 'saved: wrapped with its version' },
];
const DURATIONS = [1600, 2000, 2400];

export function EnvelopePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 2);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-10">
      <div className="flex h-16 items-center">
        <motion.div
          layout
          transition={ENTER}
          className={`flex items-center gap-2 rounded-lg font-mono text-[12px] ${now.wrapped ? 'border border-border bg-background px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : ''}`}
        >
          <AnimatePresence initial={false}>
            {now.wrapped && (
              <motion.span
                key={`open-${round}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
                className="text-muted-foreground"
              >
                {"{ _v: 'v2', _value:"}
              </motion.span>
            )}
          </AnimatePresence>
          <span className="rounded border border-border px-1.5 py-0.5">
            <Roll value={now.text} />
          </span>
          <AnimatePresence initial={false}>
            {now.wrapped && (
              <motion.span
                key={`close-${round}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
                className="text-muted-foreground"
              >
                {'}'}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      <p className="mt-4 h-4 text-center font-mono text-[11px] text-muted-foreground">
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
