import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A task saved by release 1 meets release 2. On the left, the row as the
 * database keeps it; on the right, the task as the app holds it. A read
 * carries the row across at its own version, v1. Then the one migration
 * runs, and the task becomes v2 with its new field; the row on the left
 * has not moved. Last, the app saves the task, and only then is the row
 * written again, in the latest shape.
 */

type Card = {
  readonly version: 'v1' | 'v2';
  readonly priority?: boolean;
};

type Step = {
  readonly stored: Card;
  readonly app?: Card;
  /** What is travelling between the two, and which way. */
  readonly moving?: { readonly label: string; readonly to: 'app' | 'stored' };
  readonly rule?: string;
};

const STEPS: ReadonlyArray<Step> = [
  { stored: { version: 'v1' } },
  {
    stored: { version: 'v1' },
    moving: { label: 'read', to: 'app' },
    rule: 'decoded at its own version',
  },
  { stored: { version: 'v1' }, app: { version: 'v1' }, rule: 'decoded at v1' },
  {
    stored: { version: 'v1' },
    app: { version: 'v2', priority: true },
    rule: "migration v1 → v2: priority = 'low'",
  },
  {
    stored: { version: 'v1' },
    app: { version: 'v2', priority: true },
    rule: 'storage untouched: still v1',
  },
  {
    stored: { version: 'v1' },
    app: { version: 'v2', priority: true },
    moving: { label: 'save', to: 'stored' },
    rule: 'a save always writes the latest version',
  },
  {
    stored: { version: 'v2', priority: true },
    app: { version: 'v2', priority: true },
    rule: 'written at v2',
  },
];
const DURATIONS = [1100, 1000, 1300, 1800, 1600, 1000, 2000];

function TaskCard({
  card,
  flash,
  dim = false,
}: {
  readonly card: Card;
  readonly flash?: number;
  readonly dim?: boolean;
}) {
  return (
    <div
      className={`relative rounded-lg border border-border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-opacity duration-300 ${dim ? 'opacity-60' : ''}`}
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[12px]">
        <span className="font-medium">Task</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={card.version}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: ENTER }}
            exit={{ opacity: 0, y: 6, transition: EXIT }}
            className="rounded bg-foreground px-1 font-mono text-[10px] text-background"
          >
            {card.version}
          </motion.span>
        </AnimatePresence>
      </p>
      <dl className="font-mono text-[11px] leading-5">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">title</dt>
          <dd>'Plan the week'</dd>
        </div>
        <AnimatePresence initial={false}>
          {card.priority && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 20, transition: ENTER }}
              exit={{ opacity: 0, height: 0, transition: EXIT }}
              className="flex gap-2 overflow-hidden"
            >
              <dt className="text-muted-foreground">priority</dt>
              <dd>'low'</dd>
            </motion.div>
          )}
        </AnimatePresence>
      </dl>
      <Flash at={flash} />
    </div>
  );
}

export function ReadPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  const now = STEPS[step]!;
  const flash = (at: number) => (step >= at ? round * 10 + at : undefined);
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto grid max-w-md grid-cols-[1fr_4rem_1fr] items-start gap-2 sm:grid-cols-[1fr_6rem_1fr]">
        <p className="text-[11px] font-medium text-muted-foreground">
          In the database
        </p>
        <span />
        <p className="text-[11px] font-medium text-muted-foreground">
          In release 2
        </p>
        <TaskCard
          card={now.stored}
          {...(step === 6 ? { flash: flash(6) } : {})}
        />
        <div className="relative h-full min-h-16">
          <AnimatePresence>
            {now.moving && (
              <motion.span
                key={`${round}-${step}`}
                initial={{
                  opacity: 0,
                  x: now.moving.to === 'app' ? '-40%' : '40%',
                }}
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] },
                }}
                exit={{ opacity: 0, transition: EXIT }}
                className="absolute inset-x-0 top-6 mx-auto w-fit rounded-full border border-border bg-background px-2 font-mono text-[10px]"
              >
                {now.moving.to === 'app'
                  ? `${now.moving.label} →`
                  : `← ${now.moving.label}`}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="min-h-[4.5rem]">
          <AnimatePresence initial={false}>
            {now.app && (
              <motion.div
                key={`app-${round}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                <TaskCard
                  card={now.app}
                  {...(step >= 3 ? { flash: flash(3) } : {})}
                />
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
