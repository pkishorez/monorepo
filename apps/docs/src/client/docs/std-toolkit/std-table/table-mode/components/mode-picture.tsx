import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Message,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * The same breaking change reaches two tables at setup. The persistent
 * one refuses it: it shakes, and every row stays. The disposable one
 * throws its rows away and is set up fresh. One thing moves at a time:
 * the change arrives, the persistent table answers, then the disposable.
 */

const ROWS = ['t1 · Plan', 't2 · Ship', 't3 · Cook'];
const DURATIONS = [1400, 1200, 1800, 2400];

function Table({
  mode,
  rows,
  refused,
  note,
}: {
  readonly mode: string;
  readonly rows: boolean;
  readonly refused: boolean;
  readonly note?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">{mode}</p>
      <motion.div
        animate={{ x: refused ? [0, -5, 5, -3, 3, 0] : 0 }}
        transition={{ duration: 0.4 }}
        className="min-h-[6.75rem] space-y-1 rounded-xl border border-border bg-background p-2"
      >
        <AnimatePresence initial={false}>
          {rows &&
            ROWS.map((row) => (
              <motion.p
                key={row}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
                className="rounded-md border border-border px-2 py-1 font-mono text-[11px]"
              >
                {row}
              </motion.p>
            ))}
        </AnimatePresence>
      </motion.div>
      <p className="mt-2 h-8 font-mono text-[10.5px] leading-4 text-muted-foreground">
        <AnimatePresence mode="wait">
          {note && (
            <motion.span
              key={note}
              className="inline-block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
            >
              {note}
            </motion.span>
          )}
        </AnimatePresence>
      </p>
    </div>
  );
}

export function ModePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <div className="flex h-8 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {step >= 1 && (
              <motion.span
                key={round}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                <Message>setup: a breaking change</Message>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <Table
            mode="persistent"
            rows
            refused={step === 2}
            {...(step >= 2
              ? { note: 'refused: SetupRefused. Every row kept.' }
              : {})}
          />
          <Table
            mode="disposable"
            rows={step < 3}
            refused={false}
            {...(step >= 3 ? { note: 'wiped, then set up fresh.' } : {})}
          />
        </div>
      </div>
    </div>
  );
}
