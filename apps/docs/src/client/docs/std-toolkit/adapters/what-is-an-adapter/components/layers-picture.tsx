import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  SPRING,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * One program, four homes for its table. The program sits on top and never
 * changes. Below it, the four adapters; one at a time is given the
 * program, the line under the program names its layer, and then the same
 * answer comes back. Only the adapter moves; the program and its answer
 * stay put.
 */

const ADAPTERS = [
  { name: 'Memory', layer: 'Memory.make(table).layer' },
  { name: 'IndexedDB', layer: 'IDB.make(table, …).layer' },
  { name: 'SQLite', layer: 'SQLite.make(table, …).layer' },
  { name: 'DynamoDB', layer: 'DynamoDB.make(table, …).layer' },
] as const;

/** Each adapter takes two steps: it is given the program, then answers. */
const DURATIONS = ADAPTERS.flatMap(() => [1100, 1500]);

export function LayersPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 1);
  const at = Math.floor(step / 2);
  const answered = step % 2 === 1;
  const adapter = ADAPTERS[at]!;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <div className="rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-[11.5px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="mb-1 font-sans text-[12px] font-medium">program</p>
          <p>
            task.insert({'{'} title: 'Plan the week' {'}'})
          </p>
          <p>task.query('primary', …)</p>
          <p className="mt-1 h-5 text-muted-foreground">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={adapter.name}
                className="inline-block"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                .pipe(Effect.provide({adapter.layer}))
              </motion.span>
            </AnimatePresence>
          </p>
        </div>
        <ul className="mt-4 grid grid-cols-4 gap-2">
          {ADAPTERS.map((entry, index) => (
            <li
              key={entry.name}
              className={`relative rounded-md border px-1 py-1.5 text-center text-[11px] font-medium transition-colors duration-200 ${index === at ? 'border-foreground/40 text-foreground' : 'border-border text-muted-foreground'}`}
            >
              {index === at && (
                <motion.span
                  layoutId="layers-picture-at"
                  transition={SPRING}
                  className="absolute inset-0 rounded-[inherit] bg-muted"
                />
              )}
              <span className="relative">{entry.name}</span>
            </li>
          ))}
        </ul>
        <div className="relative mt-4 flex h-9 items-center justify-center rounded-md border border-dashed border-border font-mono text-[11.5px]">
          <AnimatePresence mode="wait" initial={false}>
            {answered ? (
              <motion.span
                key={`answer-${round}-${at}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                ['Plan the week']
              </motion.span>
            ) : (
              <motion.span
                key={`wait-${round}-${at}`}
                className="text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                running on {adapter.name}…
              </motion.span>
            )}
          </AnimatePresence>
          <Flash {...(answered ? { at: round * 10 + at + 1 } : {})} />
        </div>
      </div>
    </div>
  );
}
