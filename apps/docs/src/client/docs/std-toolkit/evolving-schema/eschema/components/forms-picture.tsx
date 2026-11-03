import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * One task in its two forms. On the left the value your code holds; on
 * the right the form that is stored. Saving carries the value across and
 * stamps `_v: 'v1'` on it. Reading carries it back, and the stamp comes
 * off: your code never sees a version.
 */

const STEPS = [
  { stored: false, moving: undefined, rule: 'the value: what your code holds' },
  { stored: false, moving: 'save', rule: 'encode: stamp the version' },
  { stored: true, moving: undefined, rule: "stored: the fields, and _v: 'v1'" },
  { stored: true, moving: 'read', rule: 'decode: read it at its version' },
  { stored: true, moving: undefined, rule: 'the same value, no version in it' },
] as const;
const DURATIONS = [1500, 1100, 1900, 1100, 1900];

function Card({
  title,
  stamped,
}: {
  readonly title: string;
  readonly stamped: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-[11px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="mb-1 font-sans text-[12px] font-medium">{title}</p>
      <p>
        <span className="text-muted-foreground">boardId </span>'work'
      </p>
      <p>
        <span className="text-muted-foreground">title </span>'Plan the week'
      </p>
      <AnimatePresence initial={false}>
        {stamped && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 20, transition: ENTER }}
            exit={{ opacity: 0, height: 0, transition: EXIT }}
            className="overflow-hidden"
          >
            <span className="text-muted-foreground">_v </span>
            <span className="rounded bg-foreground px-1 text-background">
              'v1'
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FormsPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 2);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto grid max-w-md grid-cols-[1fr_4.5rem_1fr] items-center gap-2">
        <Card title="In your code" stamped={false} />
        <div className="relative h-8">
          <AnimatePresence>
            {now.moving && (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, x: now.moving === 'save' ? -10 : 10 }}
                animate={{ opacity: 1, x: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
                className="absolute inset-x-0 top-1 mx-auto w-fit rounded-full border border-border bg-background px-2 font-mono text-[10px]"
              >
                {now.moving === 'save' ? 'save →' : '← read'}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className={now.stored ? '' : 'opacity-30'}>
          <Card title="Stored" stamped={now.stored} />
        </div>
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
