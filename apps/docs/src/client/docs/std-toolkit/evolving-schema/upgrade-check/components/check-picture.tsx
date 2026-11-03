import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * The upgrade check, one generated row at a time. Each is a value v1
 * could have stored. It goes through the migration to v2: a number reads
 * fine and is ticked, until one row, text that isn't a number, fails, and
 * the check stops there and names it.
 */

const ROWS = ["'3'", "'0.5'", "'12'", "''", "'a'"] as const;
const RESULTS = ['3', '0.5', '12', '0', 'not a number'] as const;
const DURATIONS = [900, 900, 900, 900, 2600];

export function CheckPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  return (
    <div ref={ref} className="px-4 py-8">
      <div className="mx-auto max-w-sm">
        <p className="mb-2 grid grid-cols-[1fr_auto_1fr] gap-3 text-[11px] font-medium text-muted-foreground">
          <span>stored at v1</span>
          <span className="font-mono">v1 → v2</span>
          <span className="text-right">read at v2</span>
        </p>
        <ul className="space-y-1.5">
          {ROWS.map((row, index) => {
            const failed = index === ROWS.length - 1;
            return (
              <li
                key={row}
                className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors duration-300 ${index === step ? (failed ? 'border-red-500' : 'border-foreground/40') : 'border-border'}`}
              >
                <span>estimate: {row}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-right">
                  <AnimatePresence initial={false}>
                    {index <= step && (
                      <motion.span
                        key={`${round}-${index}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: ENTER }}
                        exit={{ opacity: 0, transition: EXIT }}
                        className={
                          failed ? 'text-red-600 dark:text-red-400' : ''
                        }
                      >
                        {failed ? `✕ ${RESULTS[index]}` : `${RESULTS[index]} ✓`}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 h-4 text-center font-mono text-[11px] text-muted-foreground">
          {step === ROWS.length - 1
            ? "Task v1 → v2: upgrade failed · { estimate: 'a' }"
            : 'generating rows v1 could have stored…'}
        </p>
      </div>
    </div>
  );
}
