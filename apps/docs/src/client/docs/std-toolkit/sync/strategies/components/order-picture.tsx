import { motion } from 'motion/react';
import { ENTER, useSteps } from '../../../../../components/index.ts';

/*
 * The same eight changes on the Backend, oldest on the left, read by two
 * strategies side by side. oldToNew fills them in pages from the left;
 * newToOld fills the newest page first, then older ones. Last, a ninth
 * change arrives, and both pick it up: oldToNew by polling past its
 * cursor, newToOld by keeping its top fresh.
 */

/** Which changes each strategy has read, by step. The ninth arrives last. */
const OLD_TO_NEW = [0, 3, 6, 8, 9];
const NEW_TO_OLD: ReadonlyArray<ReadonlyArray<number>> = [
  [],
  [6, 7, 8],
  [3, 4, 5, 6, 7, 8],
  [1, 2, 3, 4, 5, 6, 7, 8],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
];
const LINES = [
  'eight changes on the Backend, oldest first',
  'the first page',
  'the next page',
  'caught up',
  'a new change: both pick it up',
];
const DURATIONS = [1200, 1300, 1300, 1600, 2000];

function Lane({
  name,
  note,
  read,
  arrived,
}: {
  readonly name: string;
  readonly note: string;
  readonly read: (change: number) => boolean;
  readonly arrived: boolean;
}) {
  const changes = arrived ? 9 : 8;
  return (
    <div>
      <p className="mb-1.5 flex items-baseline gap-2 text-[11px]">
        <span className="font-mono font-medium">{name}</span>
        <span className="text-muted-foreground">{note}</span>
      </p>
      <ol className="grid grid-cols-9 gap-1">
        {Array.from({ length: changes }, (_, index) => index + 1).map(
          (change) => (
            <motion.li
              key={change}
              initial={change === 9 ? { opacity: 0, scale: 0.8 } : false}
              animate={{ opacity: 1, scale: 1, transition: ENTER }}
              className={`grid h-7 place-items-center rounded border font-mono text-[10px] transition-colors duration-300 ${read(change) ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'}`}
            >
              {change}
            </motion.li>
          ),
        )}
      </ol>
    </div>
  );
}

export function OrderPicture() {
  const [ref, step] = useSteps(DURATIONS, 2);
  const arrived = step === 4;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-md space-y-5">
        <Lane
          name="oldToNew"
          note="oldest first"
          read={(change) => change <= OLD_TO_NEW[step]!}
          arrived={arrived}
        />
        <Lane
          name="newToOld"
          note="newest first"
          read={(change) => NEW_TO_OLD[step]!.includes(change)}
          arrived={arrived}
        />
      </div>
      <p className="mt-6 text-center font-mono text-[11px] text-muted-foreground">
        {LINES[step]}
      </p>
    </div>
  );
}
