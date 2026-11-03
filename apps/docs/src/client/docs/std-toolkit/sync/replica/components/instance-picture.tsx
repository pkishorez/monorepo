import { AnimatePresence, motion } from 'motion/react';
import {
  Box,
  ENTER,
  EXIT,
  Pill,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A Replica's life, as Actors. Replicas sits near the root. A Query asks
 * for one account's Instance, so Replicas starts it. The Instance shows
 * what the Store already holds at once, then its Strategy fetches and the
 * Query is Caught Up. The Query goes; the Instance runs on for its GC
 * Time, then stops. The Store keeps every row.
 */

type Step = {
  readonly query: boolean;
  readonly instance?: string;
  readonly rows: number;
  readonly caughtUp?: boolean;
  readonly line: string;
};

const STEPS: ReadonlyArray<Step> = [
  { query: false, rows: 0, line: 'two wallets in the Store, from last time' },
  {
    query: true,
    instance: 'starting',
    rows: 0,
    line: 'a Query asks for pocket·acct-1',
  },
  {
    query: true,
    instance: 'running',
    rows: 2,
    line: 'what the Store holds shows at once',
  },
  {
    query: true,
    instance: 'running',
    rows: 3,
    caughtUp: true,
    line: 'its Strategy fetches: Caught Up',
  },
  {
    query: false,
    instance: 'GC Time: 5s',
    rows: 0,
    line: 'the Query goes; the Instance runs on a while',
  },
  { query: false, rows: 0, line: 'then stops. The Store keeps all three' },
];
const DURATIONS = [1400, 1200, 1600, 2000, 1800, 1800];

const WALLETS = ['Cash', 'Bank', 'Travel'];

export function InstancePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const now = STEPS[step]!;
  const stored = step >= 3 ? 3 : 2;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-4">
        <div className="space-y-2">
          <Box name="Root" compact />
          <div className="ml-4 space-y-2 border-l border-border pl-3">
            <Box name="Replicas" compact />
            <div className="ml-4 min-h-8 border-l border-border pl-3">
              <AnimatePresence initial={false}>
                {now.instance && (
                  <motion.div
                    key={`instance-${round}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0, transition: ENTER }}
                    exit={{ opacity: 0, transition: EXIT }}
                  >
                    <Box name="acct-1" compact>
                      <Pill>{now.instance}</Pill>
                    </Box>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        <div className="min-h-[7.5rem]">
          <AnimatePresence initial={false}>
            {now.query && (
              <motion.div
                key={`query-${round}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
                className="rounded-lg border border-border bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <p className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="font-medium">Wallets</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    caughtUp: {now.caughtUp ? 'true' : 'false'}
                  </span>
                </p>
                <ul className="min-h-[3.75rem] space-y-1">
                  <AnimatePresence initial={false}>
                    {WALLETS.slice(0, now.rows).map((wallet) => (
                      <motion.li
                        key={wallet}
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0, transition: ENTER }}
                        exit={{ opacity: 0, transition: EXIT }}
                        className="rounded border border-border px-1.5 text-[10.5px] leading-[18px]"
                      >
                        {wallet}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="mx-auto mt-4 flex max-w-md items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-[11px]">
        <span className="font-medium">Store</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          IndexedDB · {stored} wallets
        </span>
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
            {now.line}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  );
}
