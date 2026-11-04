import { motion } from 'motion/react';
import {
  Box,
  ENTER,
  EXIT,
  Flash,
  Pill,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * A Replica's life, as Actors. Replicas sits near the root. A Query asks
 * for one account's Instance, so Replicas starts it. The Instance shows
 * what the Store already holds at once, then its Strategy fetches and the
 * Query is Caught Up. The Query goes; the Instance runs on for its GC
 * Time, then stops. The Store keeps every row. The Instance, the Query and
 * its three wallets keep their places from the start, faded until they
 * are there, so nothing grows; on a phone the tree sits over the Query.
 */

type Step = {
  readonly query: boolean;
  readonly instance?: string;
  readonly rows: number;
  readonly caughtUp?: boolean;
  readonly stored: number;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    query: false,
    rows: 0,
    stored: 2,
    caption:
      'Replicas sits near the root. The Store holds two wallets from last time.',
  },
  {
    query: true,
    instance: 'starting',
    rows: 0,
    stored: 2,
    caption:
      'A Query asks for one account’s wallets, so Replicas starts its Instance.',
  },
  {
    query: true,
    instance: 'running',
    rows: 2,
    stored: 2,
    caption: 'The Instance shows what the Store already holds, at once.',
  },
  {
    query: true,
    instance: 'running',
    rows: 3,
    caughtUp: true,
    stored: 3,
    caption:
      'Its Strategy fetches what changed. A third wallet arrives, and the Query is Caught Up.',
  },
  {
    query: false,
    instance: 'GC Time: 5s',
    rows: 0,
    stored: 3,
    caption:
      'The Query goes. The Instance runs on for its GC Time, in case it is asked again.',
  },
  {
    query: false,
    rows: 0,
    stored: 3,
    caption: 'Then the Instance stops. The Store keeps all three wallets.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

const WALLETS = ['Cash', 'Bank', 'Travel'];

/** Shown, or faded out in its place. */
const reveal = (there: boolean) => ({
  initial: false as const,
  animate: there ? { opacity: 1, y: 0 } : { opacity: 0, y: 3 },
  transition: there ? ENTER : EXIT,
  'aria-hidden': !there,
});

export function InstancePicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  const flash = (when: number) =>
    step === when ? round * 10 + when : undefined;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto grid max-w-md gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Box name="Root" compact />
            <div className="ml-4 space-y-2 border-l border-border pl-3">
              <Box name="Replicas" compact />
              <div className="ml-4 border-l border-border pl-3">
                <motion.div {...reveal(now.instance !== undefined)}>
                  <Box name="acct-1" compact flash={flash(1) ?? flash(4)}>
                    <Pill className="whitespace-nowrap">
                      {now.instance ?? 'GC Time: 5s'}
                    </Pill>
                  </Box>
                </motion.div>
              </div>
            </div>
          </div>
          <motion.div
            {...reveal(now.query)}
            className="relative rounded-lg border border-border bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <p className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
              <span className="font-medium">Wallets</span>
              <span
                className={`font-mono text-[10px] transition-colors duration-300 ${step === 3 ? 'text-(--field-accent)' : 'text-muted-foreground'}`}
              >
                caughtUp: {now.caughtUp ? 'true' : 'false'}
              </span>
            </p>
            <ul className="space-y-1">
              {WALLETS.map((wallet, index) => (
                <motion.li
                  key={wallet}
                  {...reveal(index < now.rows)}
                  className="rounded border border-border px-1.5 text-[10.5px] leading-[18px]"
                >
                  {wallet}
                </motion.li>
              ))}
            </ul>
            <Flash at={flash(2)} />
          </motion.div>
        </div>
        <div className="relative mx-auto mt-4 flex max-w-md items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-[11px]">
          <span className="font-medium">Store</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            IndexedDB · {now.stored} wallets
          </span>
          <Flash at={flash(5)} />
        </div>
      </div>
    </Walkthrough>
  );
}
