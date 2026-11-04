import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * Table shapes, tried one at a time. Each step writes one out, and a beat
 * later it is judged under it: the one DynamoDB could hold is accepted,
 * lit in the accent; the others are refused with the reason, the moment
 * they are defined, before any data exists. The shape's box keeps room
 * for two lines on a phone, so the longest shape never makes it grow.
 */

const SHAPES = [
  {
    code: ".primary('pk', 'sk').gsi('GSI1', 'GSI1PK', 'GSI1SK')",
    verdict: 'accepted',
    caption:
      'A partition key, a sort key and one global index. DynamoDB can hold that, so it is accepted.',
  },
  {
    code: ".primary('pk', 'pk')",
    verdict: 'refused: one attribute, two keys',
    caption:
      'One attribute as both partition and sort key is refused the moment it is defined.',
  },
  {
    code: ".primary('_v', 'sk')",
    verdict: "refused: '_v' is reserved",
    caption:
      'std-toolkit keeps _v for the version it stamps on every row, so it cannot be a key.',
  },
  {
    code: ".lsi('L1', 's1') … .lsi('L6', 's6')",
    verdict: 'refused: DynamoDB allows five local indexes',
    caption:
      'Six local indexes: DynamoDB allows five, so every adapter refuses the sixth, before any data exists.',
  },
] as const;
const CAPTIONS = SHAPES.map((each) => each.caption);

export function LimitsPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const shape = SHAPES[step]!;
  const accepted = shape.verdict === 'accepted';
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-md text-center">
          <p className="font-mono text-[11px] text-muted-foreground">
            StdTable.make('board')
          </p>
          <div className="mt-2 flex h-14 items-center justify-center rounded-lg border border-border bg-background px-3 font-mono text-[11px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:h-10 sm:text-[11.5px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                {shape.code}
              </motion.span>
            </AnimatePresence>
          </div>
          <p className="mt-4 h-6">
            <AnimatePresence mode="wait">
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: accepted ? 0 : [0, -5, 5, -3, 3, 0],
                  transition: accepted
                    ? { ...ENTER, delay: 0.45 }
                    : { duration: 0.4, delay: 0.45 },
                }}
                exit={{ opacity: 0, transition: EXIT }}
                className={`inline-block rounded-full border px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap ${accepted ? 'border-(--field-accent) text-(--field-accent)' : 'border-red-500 text-red-600 dark:text-red-400'}`}
              >
                {shape.verdict}
              </motion.span>
            </AnimatePresence>
          </p>
        </div>
      </div>
    </Walkthrough>
  );
}
