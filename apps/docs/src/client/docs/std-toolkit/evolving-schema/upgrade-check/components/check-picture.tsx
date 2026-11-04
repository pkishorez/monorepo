import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * The upgrade check, one generated row at a time. Each is a value v1
 * could have stored. It goes through the migration to v2: a number reads
 * fine and is ticked, the row being read outlined in the accent, until
 * one row, text that isn't a number, fails in red, and the check stops
 * there and names it. Every result has its place from the start.
 */

const ROWS = ["'3'", "'0.5'", "'12'", "''", "'a'"] as const;
const RESULTS = ['3', '0.5', '12', '0', 'not a number'] as const;

const CAPTIONS = [
  "The check makes up values v1 could have stored. '3' reads at v2 as 3.",
  "'0.5' reads fine too: stored at v1, then read at the latest version.",
  "'12' passes. The check keeps generating, looking for a row that breaks.",
  'Empty text reads as 0. Still a number, still fine.',
  "'a' is not a number, so the migration fails. The check stops and names this row.",
];

export function CheckPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step } = walk;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8">
        <div className="mx-auto max-w-sm">
          <p className="mb-2 grid grid-cols-[1fr_auto_1fr] gap-3 text-[11px] font-medium text-muted-foreground">
            <span>stored at v1</span>
            <span className="font-mono">v1 → v2</span>
            <span className="text-right">read at v2</span>
          </p>
          <ul className="space-y-1.5">
            {ROWS.map((row, index) => {
              const failed = index === ROWS.length - 1;
              const read = index <= step;
              return (
                <li
                  key={row}
                  className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors duration-300 ${index === step ? (failed ? 'border-red-500' : 'border-(--field-accent)') : 'border-border'}`}
                >
                  <span className="whitespace-nowrap">estimate: {row}</span>
                  <span className="text-muted-foreground">→</span>
                  <motion.span
                    initial={false}
                    animate={{ opacity: read ? 1 : 0 }}
                    transition={read ? ENTER : EXIT}
                    aria-hidden={!read}
                    className={`text-right whitespace-nowrap ${failed ? 'text-red-600 dark:text-red-400' : ''}`}
                  >
                    {failed ? `✕ ${RESULTS[index]}` : `${RESULTS[index]} ✓`}
                  </motion.span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Walkthrough>
  );
}
