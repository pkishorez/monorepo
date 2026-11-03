import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * Table shapes, tried one at a time. Each is written out, then judged:
 * the one DynamoDB could hold is accepted, the others are refused with
 * the reason, the moment they are defined, before any data exists.
 */

const SHAPES = [
  {
    code: ".primary('pk', 'sk').gsi('GSI1', 'GSI1PK', 'GSI1SK')",
    verdict: 'accepted',
  },
  { code: ".primary('pk', 'pk')", verdict: 'refused: one attribute, two keys' },
  { code: ".primary('_v', 'sk')", verdict: "refused: '_v' is reserved" },
  {
    code: ".lsi('L1', 's1') … .lsi('L6', 's6')",
    verdict: 'refused: DynamoDB allows five local indexes',
  },
] as const;

/** Each shape is written, then judged. */
const DURATIONS = SHAPES.flatMap(() => [900, 1700]);

export function LimitsPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const shape = SHAPES[Math.floor(step / 2)]!;
  const judged = step % 2 === 1;
  const accepted = shape.verdict === 'accepted';
  return (
    <div ref={ref} className="px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-md text-center">
        <p className="font-mono text-[11px] text-muted-foreground">
          StdTable.make('board')
        </p>
        <div className="mt-2 flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 font-mono text-[11.5px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`${round}-${shape.code}`}
              className="truncate"
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
            {judged && (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: accepted ? 0 : [0, -5, 5, -3, 3, 0],
                  transition: accepted ? ENTER : { duration: 0.4 },
                }}
                exit={{ opacity: 0, transition: EXIT }}
                className={`inline-block rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${accepted ? 'border-border' : 'border-red-500 text-red-600 dark:text-red-400'}`}
              >
                {shape.verdict}
              </motion.span>
            )}
          </AnimatePresence>
        </p>
      </div>
    </div>
  );
}
