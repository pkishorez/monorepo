import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * Three rows saved by three releases, each stamped with its version, on
 * the left. One by one they are read: each crosses to the right in
 * today's shape, the fields it never had filled in by the migrations it
 * passes. The rows on the left never change. Last, a new save goes in at
 * the latest version.
 */

type Row = {
  readonly title: string;
  readonly version: 'v1' | 'v2' | 'v3';
  /** The fields today's shape adds to it as it is read. */
  readonly added: string;
};

const ROWS: ReadonlyArray<Row> = [
  { title: 'Plan the week', version: 'v1', added: '+ priority, + done' },
  { title: 'Water the plants', version: 'v2', added: '+ done' },
  { title: 'Call home', version: 'v3', added: 'as it is' },
];

/** At each step: how many rows have been read, and whether the save has happened. */
const STEPS = [
  { read: 0, saved: false, rule: 'rows saved by three releases' },
  { read: 1, saved: false, rule: 'v1 → v2 → v3: two migrations' },
  { read: 2, saved: false, rule: 'v2 → v3: one migration' },
  { read: 3, saved: false, rule: 'v3: nothing to do' },
  { read: 3, saved: true, rule: 'a save always writes v3' },
] as const;
const DURATIONS = [1500, 1900, 1700, 1500, 2300];

function Stamp({ version }: { readonly version: string }) {
  return (
    <span className="rounded bg-foreground px-1 font-mono text-[10px] text-background">
      {version}
    </span>
  );
}

export function VersionsPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto grid max-w-lg grid-cols-2 gap-x-6 gap-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          In the database
        </p>
        <p className="text-[11px] font-medium text-muted-foreground">
          What your code reads
        </p>
        {[...ROWS, null].map((row, index) => {
          const stored = row ?? {
            title: 'Fix the bike',
            version: 'v3' as const,
            added: '',
          };
          const there = row ? true : now.saved;
          return (
            <div key={index} className="contents">
              <div className="h-9">
                <AnimatePresence initial={false}>
                  {there && (
                    <motion.div
                      key={`${round}-stored-${index}`}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0, transition: ENTER }}
                      exit={{ opacity: 0, transition: EXIT }}
                      className="relative flex h-9 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-[12px]"
                    >
                      <span className="truncate">{stored.title}</span>
                      <Stamp version={stored.version} />
                      {!row && <Flash at={round + 1} />}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="h-9">
                <AnimatePresence initial={false}>
                  {row && now.read > index && (
                    <motion.div
                      key={`${round}-read-${index}`}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0, transition: ENTER }}
                      exit={{ opacity: 0, transition: EXIT }}
                      className="flex h-9 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-[12px]"
                    >
                      <span className="truncate">{row.title}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {row.added}
                        </span>
                        <Stamp version="v3" />
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-6 h-4 text-center font-mono text-[11px] text-muted-foreground">
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
