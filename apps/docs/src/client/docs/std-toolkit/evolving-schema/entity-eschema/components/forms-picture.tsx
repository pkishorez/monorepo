import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * One task in its two forms. On the left the value your code holds, with
 * a real Date; on the right the encoded form the table keeps, plain JSON
 * with the version beside it. A save carries the value across: the Date
 * becomes a string and `_v` is stamped on. A read carries it back. The
 * id field sits first in both, and never changes.
 */

type Step = {
  readonly stored: boolean;
  readonly moving?: 'save' | 'read';
  readonly rule?: string;
};

const STEPS: ReadonlyArray<Step> = [
  { stored: false, rule: 'the value: what your code holds' },
  {
    stored: false,
    moving: 'save',
    rule: 'encode: convert each field, stamp the version',
  },
  { stored: true, rule: "the encoded form: plain JSON, with _v: 'v1'" },
  { stored: true, moving: 'read', rule: 'decode: read it at its version' },
  { stored: true, rule: 'the same value, Date and all' },
];
const DURATIONS = [1600, 1200, 2000, 1200, 1800];

function Line({
  name,
  value,
  mark,
}: {
  readonly name: string;
  readonly value: string;
  readonly mark?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{name}</dt>
      <dd
        className={
          mark
            ? 'text-foreground underline decoration-foreground/30 underline-offset-2'
            : ''
        }
      >
        {value}
      </dd>
    </div>
  );
}

export function FormsPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 2);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto grid max-w-lg grid-cols-[1fr_3.5rem_1fr] items-start gap-2 sm:grid-cols-[1fr_5rem_1fr]">
        <p className="text-[11px] font-medium text-muted-foreground">Value</p>
        <span />
        <p className="text-[11px] font-medium text-muted-foreground">
          Encoded form
        </p>
        <div className="rounded-lg border border-border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dl className="font-mono text-[11px] leading-5">
            <Line name="taskId" value="'t1'" />
            <Line name="title" value="'Plan'" />
            <Line name="dueAt" value="Date" mark />
          </dl>
        </div>
        <div className="relative h-full min-h-16">
          <AnimatePresence>
            {now.moving && (
              <motion.span
                key={`${round}-${step}`}
                initial={{
                  opacity: 0,
                  x: now.moving === 'save' ? '-40%' : '40%',
                }}
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] },
                }}
                exit={{ opacity: 0, transition: EXIT }}
                className="absolute inset-x-0 top-5 mx-auto w-fit rounded-full border border-border bg-background px-2 font-mono text-[10px]"
              >
                {now.moving === 'save' ? 'save →' : '← read'}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="min-h-[5.5rem]">
          <AnimatePresence initial={false}>
            {now.stored && (
              <motion.div
                key={`stored-${round}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
                className="rounded-lg border border-border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <dl className="font-mono text-[11px] leading-5">
                  <Line name="taskId" value="'t1'" />
                  <Line name="title" value="'Plan'" />
                  <Line name="dueAt" value="'2026-11-09'" mark />
                  <Line name="_v" value="'v1'" mark />
                </dl>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <p className="mt-6 h-4 text-center font-mono text-[11px] text-muted-foreground">
        <AnimatePresence mode="wait">
          {now.rule && (
            <motion.span
              key={`${round}-${step}`}
              className="inline-block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
            >
              {now.rule}
            </motion.span>
          )}
        </AnimatePresence>
      </p>
    </div>
  );
}
