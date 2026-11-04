import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  SPRING,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * One program, four homes for its table. The program sits on top and
 * never changes but for its last line, the layer it is given. Below it,
 * the four adapters; each step, the next one is given the program, and
 * the same answer comes back and lights. Every layer line shares one
 * cell, as wide as the widest, so a swap moves nothing else.
 */

const ADAPTERS = [
  {
    name: 'Memory',
    layer: 'Memory.make(table).layer',
    caption:
      'Provide Memory’s layer, and the program runs in memory. It reads back its task.',
  },
  {
    name: 'IndexedDB',
    layer: 'IDB.make(table, …).layer',
    caption:
      'Swap in IndexedDB’s layer. The program is the same, and so is its answer.',
  },
  {
    name: 'SQLite',
    layer: 'SQLite.make(table, …).layer',
    caption: 'On SQLite, only the layer changes. The answer is the same again.',
  },
  {
    name: 'DynamoDB',
    layer: 'DynamoDB.make(table, …).layer',
    caption:
      'DynamoDB too: one line changes, and the program gets the very same answer.',
  },
] as const;
const CAPTIONS = ADAPTERS.map((each) => each.caption);

const cell = '[grid-area:1/1]';

export function LayersPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const adapter = ADAPTERS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-md">
          <div className="rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-[11.5px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <p className="mb-1 font-sans text-[12px] font-medium">program</p>
            <p>
              task.insert({'{'} title: 'Plan the week' {'}'})
            </p>
            <p>task.query('primary', …)</p>
            <p className="mt-1 grid text-muted-foreground">
              {ADAPTERS.map((entry) => (
                <span
                  key={entry.name}
                  aria-hidden
                  className={`${cell} invisible`}
                >
                  .pipe(Effect.provide(
                  <wbr />
                  <span className="whitespace-nowrap">{entry.layer}))</span>
                </span>
              ))}
              <AnimatePresence initial={false}>
                <motion.span
                  key={adapter.name}
                  className={cell}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0, transition: ENTER }}
                  exit={{ opacity: 0, y: -4, transition: EXIT }}
                >
                  .pipe(Effect.provide(
                  <wbr />
                  <span className="whitespace-nowrap">
                    <span className="text-(--field-accent)">
                      {adapter.layer}
                    </span>
                    ))
                  </span>
                </motion.span>
              </AnimatePresence>
            </p>
          </div>
          <ul className="mt-4 grid grid-cols-4 gap-2">
            {ADAPTERS.map((entry, index) => (
              <li
                key={entry.name}
                className={`relative rounded-md border px-1 py-1.5 text-center text-[11px] font-medium transition-colors duration-200 ${index === step ? 'border-foreground/40 text-foreground' : 'border-border text-muted-foreground'}`}
              >
                {index === step && (
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
            ['Plan the week']
            <Flash at={round * 10 + step + 1} />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
