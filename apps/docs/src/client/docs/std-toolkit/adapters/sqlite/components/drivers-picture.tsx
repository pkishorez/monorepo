import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  SPRING,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * One SQLite adapter over five drivers. The program and the adapter stay
 * where they are; under them, the driver that speaks to the database
 * changes, one at a time, and the line under it says where that runs.
 */

const DRIVERS = [
  { name: 'node', door: 'db/sqlite/node', where: 'Node, with node:sqlite' },
  { name: 'bun', door: 'db/sqlite/bun', where: 'Bun, with bun:sqlite' },
  {
    name: 'better-sqlite3',
    door: 'db/sqlite/better-sqlite3',
    where: 'Node, with better-sqlite3',
  },
  { name: 'd1', door: 'db/sqlite/d1', where: 'a Cloudflare Worker, on D1' },
  {
    name: 'durable-object',
    door: 'db/sqlite/durable-object',
    where: 'a Durable Object’s own SQLite',
  },
] as const;

const DURATIONS = DRIVERS.map(() => 1800);

export function DriversPicture() {
  const [ref, step] = useSteps(DURATIONS, 0);
  const driver = DRIVERS[step]!;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-md flex-col items-center gap-0">
        <div className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center font-mono text-[11.5px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          task.insert(…) · task.query(…)
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="w-full rounded-lg border border-foreground/30 bg-background px-3 py-2 text-center text-[12px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          SQLite adapter
        </div>
        <div className="h-5 w-px bg-border" />
        <ul className="flex w-full flex-wrap justify-center gap-1.5">
          {DRIVERS.map((entry, index) => (
            <li
              key={entry.name}
              className={`relative rounded-full border px-2 py-0.5 font-mono text-[10.5px] transition-colors duration-200 ${index === step ? 'border-foreground/40 text-foreground' : 'border-border text-muted-foreground'}`}
            >
              {index === step && (
                <motion.span
                  layoutId="drivers-picture-at"
                  transition={SPRING}
                  className="absolute inset-0 rounded-[inherit] bg-muted"
                />
              )}
              <span className="relative">{entry.name}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-6 h-4 text-center font-mono text-[11px] text-muted-foreground">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={driver.name}
            className="inline-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: ENTER }}
            exit={{ opacity: 0, transition: EXIT }}
          >
            {driver.door}: {driver.where}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  );
}
