import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Roll,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * Two tasks in the table, one saved before byPriority existed. Its index
 * key is empty, so a byPriority query finds only the other. drift points
 * at the empty key; reindex writes it, keeping the row's update stamp;
 * then the same query finds both.
 */

type Step = {
  readonly note: string;
  readonly found: ReadonlyArray<string>;
  readonly drifted: boolean;
  readonly repaired: boolean;
};

const STEPS: ReadonlyArray<Step> = [
  {
    note: 'old-1 was saved before byPriority',
    found: [],
    drifted: false,
    repaired: false,
  },
  {
    note: "byPriority 'high' finds one",
    found: ['new-1'],
    drifted: false,
    repaired: false,
  },
  {
    note: 'drift(old-1): its index key is missing',
    found: [],
    drifted: true,
    repaired: false,
  },
  {
    note: 'reindex: key written, _u kept',
    found: [],
    drifted: false,
    repaired: true,
  },
  {
    note: "byPriority 'high' finds both",
    found: ['old-1', 'new-1'],
    drifted: false,
    repaired: true,
  },
];
const DURATIONS = [1600, 1700, 1800, 1800, 2200];

function Row({
  id,
  index,
  found,
  marked,
  flash,
}: {
  readonly id: string;
  readonly index: string;
  readonly found: boolean;
  readonly marked: boolean;
  readonly flash?: number;
}) {
  return (
    <div
      className={`relative grid grid-cols-[4.5rem_3.5rem_1fr] items-center gap-3 rounded-lg border bg-background px-3 py-2 font-mono text-[11.5px] transition-colors duration-300 ${found ? 'border-foreground' : 'border-border'}`}
    >
      <span>{id}</span>
      <span className="text-muted-foreground">high</span>
      <span
        className={`w-fit rounded px-1 transition-[outline-color] duration-300 outline-1 outline-offset-1 ${marked ? 'outline-dashed outline-foreground' : 'outline-transparent'}`}
      >
        <Roll value={index} />
      </span>
      <Flash at={flash} />
    </div>
  );
}

export function DriftPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-80 space-y-1.5">
        <div className="grid grid-cols-[4.5rem_3.5rem_1fr] gap-3 px-3 font-mono text-[11px] text-muted-foreground">
          <span>taskId</span>
          <span>priority</span>
          <span>GSI1PK</span>
        </div>
        <Row
          id="old-1"
          index={now.repaired ? 'Task#high' : '—'}
          found={now.found.includes('old-1')}
          marked={now.drifted}
          {...(now.repaired ? { flash: round + 1 } : {})}
        />
        <Row
          id="new-1"
          index="Task#high"
          found={now.found.includes('new-1')}
          marked={false}
        />
        <p className="h-4 pt-3 text-center font-mono text-[11px] text-muted-foreground">
          <AnimatePresence mode="wait">
            <motion.span
              key={`${round}-${step}`}
              className="inline-block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
            >
              {now.note}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>
    </div>
  );
}
