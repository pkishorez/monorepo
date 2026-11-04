import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * The same eight changes on the Backend, oldest on the left, read by two
 * strategies side by side. oldToNew fills them in pages from the left;
 * newToOld fills the newest page first, then older ones. Last, a ninth
 * change arrives, and both pick it up: oldToNew by polling past its
 * cursor, newToOld by keeping its top fresh. What a step reads lights in
 * the accent, then settles to read. The ninth slot is there from the
 * start, empty, so nothing moves when it fills.
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
const CAPTIONS = [
  'Eight changes on the Backend, oldest on the left. Neither strategy has read any yet.',
  'The first page: oldToNew reads the three oldest, newToOld the three newest.',
  'The next page: oldToNew moves forward, while newToOld fills in older changes behind.',
  'Both are caught up. Every change is in the copy, read in a different order.',
  'A ninth change arrives. oldToNew polls past its cursor, newToOld keeps its top fresh.',
];
const CHANGES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function Lane({
  name,
  note,
  read,
  readBefore,
  arrived,
}: {
  readonly name: string;
  readonly note: string;
  readonly read: (change: number) => boolean;
  readonly readBefore: (change: number) => boolean;
  readonly arrived: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-baseline gap-2 text-[11px]">
        <span className="font-mono font-medium">{name}</span>
        <span className="text-muted-foreground">{note}</span>
      </p>
      <ol className="grid grid-cols-9 gap-1">
        {CHANGES.map((change) => {
          const there = change < 9 || arrived;
          const fresh = read(change) && !readBefore(change);
          return (
            <motion.li
              key={change}
              initial={false}
              animate={
                there ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }
              }
              transition={there ? ENTER : EXIT}
              aria-hidden={!there}
              className={`grid h-7 place-items-center rounded border font-mono text-[10px] transition-colors duration-300 ${
                fresh
                  ? 'border-(--field-accent) bg-(--field-accent) text-background'
                  : read(change)
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground'
              }`}
            >
              {change}
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

export function OrderPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step } = walk;
  const before = Math.max(0, step - 1);
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-md space-y-5">
          <Lane
            name="oldToNew"
            note="oldest first"
            read={(change) => change <= OLD_TO_NEW[step]!}
            readBefore={(change) => step > 0 && change <= OLD_TO_NEW[before]!}
            arrived={step === 4}
          />
          <Lane
            name="newToOld"
            note="newest first"
            read={(change) => NEW_TO_OLD[step]!.includes(change)}
            readBefore={(change) =>
              step > 0 && NEW_TO_OLD[before]!.includes(change)
            }
            arrived={step === 4}
          />
        </div>
      </div>
    </Walkthrough>
  );
}
