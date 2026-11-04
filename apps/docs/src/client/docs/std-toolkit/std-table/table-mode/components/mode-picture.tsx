import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Message,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * The same breaking change reaches two tables at setup. One thing moves
 * at a time: the change arrives, the persistent table answers, then the
 * disposable one. The persistent table refuses it: it shakes, says so,
 * and every row stays. The disposable one lets its rows go and is set up
 * fresh. Each table keeps room for its three rows and its answer, so
 * neither ever changes size.
 */

const ROWS = ['t1 · Plan', 't2 · Ship', 't3 · Cook'];

const CAPTIONS = [
  'Two tables hold the same three tasks. One is persistent, the other disposable.',
  'Setup brings both the same breaking change: an edit that strands rows already saved.',
  'The persistent table refuses it before touching anything. Every row stays.',
  'The disposable table throws its rows away and is set up fresh, ready to fetch them again.',
];

function Table({
  mode,
  rows,
  refused,
  answer,
  answered,
  flash,
}: {
  readonly mode: string;
  readonly rows: boolean;
  readonly refused: boolean;
  /** What it says once the change reaches it, and whether that is a refusal. */
  readonly answer: { readonly text: string; readonly bad: boolean };
  readonly answered: boolean;
  readonly flash?: number;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">{mode}</p>
      <motion.div
        animate={{ x: refused ? [0, -5, 5, -3, 3, 0] : 0 }}
        transition={{ duration: 0.4 }}
        className="relative flex flex-col gap-1 rounded-xl border border-border bg-background p-2"
      >
        {ROWS.map((row, index) => (
          <motion.p
            key={row}
            initial={false}
            animate={{ opacity: rows ? 1 : 0 }}
            transition={rows ? ENTER : { ...EXIT, delay: index * 0.05 }}
            className="rounded-md border border-border px-2 py-1 font-mono text-[11px] whitespace-nowrap"
          >
            {row}
          </motion.p>
        ))}
        <Flash at={flash} />
      </motion.div>
      <p className="mt-2 flex h-5 items-center justify-center">
        <motion.span
          initial={false}
          animate={answered ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
          transition={answered ? ENTER : EXIT}
          aria-hidden={!answered}
          className={`rounded-full border px-1.5 font-mono text-[10px] leading-4 whitespace-nowrap ${answer.bad ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-(--field-accent) text-(--field-accent)'}`}
        >
          {answer.text}
        </motion.span>
      </p>
    </div>
  );
}

export function ModePicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-md">
          <div className="flex h-8 items-end justify-center">
            <motion.span
              initial={false}
              animate={
                step >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }
              }
              transition={step >= 1 ? ENTER : EXIT}
            >
              <Message
                className={
                  step === 1
                    ? 'border-(--field-accent) text-(--field-accent)'
                    : ''
                }
              >
                setup: a breaking change
              </Message>
            </motion.span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <Table
              mode="persistent"
              rows
              refused={step === 2}
              answer={{ text: 'refused', bad: true }}
              answered={step >= 2}
            />
            <Table
              mode="disposable"
              rows={step < 3}
              refused={false}
              answer={{ text: 'set up fresh', bad: false }}
              answered={step >= 3}
              flash={step >= 3 ? round * 10 + 3 : undefined}
            />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
