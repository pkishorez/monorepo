import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * A task saved by release 1 meets release 2. On the left, the row as the
 * database keeps it; on the right, the task as the app holds it; between
 * them, the read that carries it across and the save that carries it
 * back, each lit in its turn. The read brings the task over at its own
 * version, v1. Then the one migration runs, and the task becomes v2 with
 * its new field; the row on the left has not moved. Last, the app saves
 * the task, and only then is the row written again, in the latest shape.
 * Both cards keep room for the new field from the start, so nothing grows.
 */

type Card = {
  readonly version: 'v1' | 'v2';
  readonly priority?: boolean;
};

type Step = {
  readonly stored: Card;
  readonly app?: Card;
  /** Which way the task is crossing in this step. */
  readonly crossing?: 'read' | 'save';
  /** Which card this step changes. */
  readonly changed?: 'stored' | 'app';
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    stored: { version: 'v1' },
    caption: 'Release 1 saved this task. The row in the database says v1.',
  },
  {
    stored: { version: 'v1' },
    app: { version: 'v1' },
    crossing: 'read',
    changed: 'app',
    caption: 'Release 2 reads it. The task arrives at its own version, v1.',
  },
  {
    stored: { version: 'v1' },
    app: { version: 'v2', priority: true },
    changed: 'app',
    caption: "The one migration runs: the task is now v2, with priority 'low'.",
  },
  {
    stored: { version: 'v1' },
    app: { version: 'v2', priority: true },
    changed: 'stored',
    caption: 'The row in the database has not moved. It is still v1.',
  },
  {
    stored: { version: 'v2', priority: true },
    app: { version: 'v2', priority: true },
    crossing: 'save',
    changed: 'stored',
    caption:
      'Only a save writes the row again, and a save writes the latest version.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

function TaskCard({
  card,
  flash,
}: {
  readonly card: Card;
  readonly flash?: number;
}) {
  return (
    <div className="relative rounded-lg border border-border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="mb-1.5 flex items-center gap-1.5 text-[12px]">
        <span className="font-medium">Task</span>
        <span className="inline-grid">
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
        </span>
      </p>
      <dl className="font-mono text-[11px] leading-5">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">title</dt>
          <dd className="whitespace-nowrap">'Plan the week'</dd>
        </div>
        <motion.div
          initial={false}
          animate={{ opacity: card.priority ? 1 : 0 }}
          transition={card.priority ? ENTER : EXIT}
          aria-hidden={!card.priority}
          className="flex flex-wrap gap-x-2"
        >
          <dt className="text-muted-foreground">priority</dt>
          <dd>'low'</dd>
        </motion.div>
      </dl>
      <Flash at={flash} />
    </div>
  );
}

function Crossing({
  label,
  lit,
}: {
  readonly label: string;
  readonly lit: boolean;
}) {
  return (
    <span
      className={`mx-auto w-fit rounded-full border px-2 font-mono text-[10px] leading-4 transition-colors duration-300 ${lit ? 'border-(--field-accent) text-(--field-accent)' : 'border-border text-muted-foreground/70'}`}
    >
      {label}
    </span>
  );
}

export function ReadPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  const flash = (card: 'stored' | 'app') =>
    now.changed === card ? round * 10 + step + 1 : undefined;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto grid max-w-md grid-cols-[1fr_4rem_1fr] items-start gap-2 sm:grid-cols-[1fr_6rem_1fr]">
          <p className="text-[11px] font-medium text-muted-foreground">
            In the database
          </p>
          <span />
          <p className="text-[11px] font-medium text-muted-foreground">
            In release 2
          </p>
          <TaskCard card={now.stored} flash={flash('stored')} />
          <div className="flex flex-col gap-3 pt-5">
            <Crossing label="read →" lit={now.crossing === 'read'} />
            <Crossing label="← save" lit={now.crossing === 'save'} />
          </div>
          <motion.div
            initial={false}
            animate={now.app ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
            transition={now.app ? ENTER : EXIT}
            aria-hidden={!now.app}
          >
            <TaskCard card={now.app ?? STEPS[1]!.app!} flash={flash('app')} />
          </motion.div>
        </div>
      </div>
    </Walkthrough>
  );
}
