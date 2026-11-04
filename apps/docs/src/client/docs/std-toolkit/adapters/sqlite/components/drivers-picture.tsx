import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  SPRING,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * One SQLite adapter over five drivers. The program and the adapter stay
 * where they are; under them, the driver that speaks to the database
 * changes, one a step, and the door it is imported from shows under it,
 * every door holding one cell as wide as the widest so none moves a thing.
 */

const DRIVERS = [
  {
    name: 'node',
    door: 'db/sqlite/node',
    caption:
      'Your program calls the SQLite adapter. Under it, the node driver opens SQLite on Node.',
  },
  {
    name: 'bun',
    door: 'db/sqlite/bun',
    caption: 'On Bun, swap in the bun driver. Nothing above it changes.',
  },
  {
    name: 'better-sqlite3',
    door: 'db/sqlite/better-sqlite3',
    caption:
      'On Node, the better-sqlite3 driver is another way to open the same database.',
  },
  {
    name: 'd1',
    door: 'db/sqlite/d1',
    caption: 'In a Cloudflare Worker, the d1 driver talks to its D1 database.',
  },
  {
    name: 'durable-object',
    door: 'db/sqlite/durable-object',
    caption:
      'In a Durable Object, the durable-object driver uses its own SQLite storage.',
  },
] as const;
const CAPTIONS = DRIVERS.map((each) => each.caption);

const cell = '[grid-area:1/1]';

export function DriversPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step } = walk;
  const driver = DRIVERS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
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
                className={`relative rounded-full border px-2 py-0.5 font-mono text-[10.5px] transition-colors duration-200 ${index === step ? 'border-(--field-accent) text-foreground' : 'border-border text-muted-foreground'}`}
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
          <p className="mt-4 grid font-mono text-[11px] text-muted-foreground">
            {DRIVERS.map((entry) => (
              <span
                key={entry.name}
                aria-hidden
                className={`${cell} invisible`}
              >
                std-toolkit/{entry.door}
              </span>
            ))}
            <AnimatePresence initial={false}>
              <motion.span
                key={driver.name}
                className={`${cell} text-center`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, y: -4, transition: EXIT }}
              >
                std-toolkit/{driver.door}
              </motion.span>
            </AnimatePresence>
          </p>
        </div>
      </div>
    </Walkthrough>
  );
}
