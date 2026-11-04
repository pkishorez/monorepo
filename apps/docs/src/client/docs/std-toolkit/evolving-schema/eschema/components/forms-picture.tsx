import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * One task in its two forms. On the left the value your code holds; on
 * the right the form that is stored; between them, the save that carries
 * it across and the read that carries it back, each lit in its turn.
 * Saving stamps `_v: 'v1'` on the stored form. Reading takes the stamp
 * off again: your code never sees a version. The stored card keeps room
 * for its stamp from the start, so nothing grows.
 */

const STEPS = [
  {
    stored: false,
    crossing: undefined,
    caption: 'In your code, a task is just its fields. This is the value.',
  },
  {
    stored: true,
    crossing: 'save',
    caption:
      "Saving encodes it: the stored form has the same fields, plus _v: 'v1'.",
  },
  {
    stored: true,
    crossing: 'read',
    caption:
      'Reading decodes it at the version _v names, and the stamp stays behind.',
  },
] as const;
const CAPTIONS = STEPS.map((each) => each.caption);

function Card({
  title,
  stamped,
  flash,
}: {
  readonly title: string;
  readonly stamped: boolean;
  readonly flash?: number;
}) {
  return (
    <div className="relative rounded-lg border border-border bg-background px-2.5 py-2.5 font-mono sm:px-3 text-[11px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="mb-1 font-sans text-[12px] font-medium">{title}</p>
      <p className="flex flex-wrap gap-x-1.5">
        <span className="text-muted-foreground">boardId</span>
        <span className="whitespace-nowrap">'work'</span>
      </p>
      <p className="flex flex-wrap gap-x-1.5">
        <span className="text-muted-foreground">title</span>
        <span className="whitespace-nowrap">'Plan the week'</span>
      </p>
      <motion.p
        initial={false}
        animate={{ opacity: stamped ? 1 : 0 }}
        transition={stamped ? ENTER : EXIT}
        aria-hidden={!stamped}
        className="flex gap-1.5"
      >
        <span className="text-muted-foreground">_v</span>
        <span className="rounded bg-foreground px-1 text-background">'v1'</span>
      </motion.p>
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
      className={`mx-auto w-fit rounded-full border px-2 font-mono text-[10px] leading-4 whitespace-nowrap transition-colors duration-300 ${lit ? 'border-(--field-accent) text-(--field-accent)' : 'border-border text-muted-foreground/70'}`}
    >
      {label}
    </span>
  );
}

export function FormsPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="px-3 py-8 sm:px-8">
        <div className="mx-auto grid max-w-md grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[1fr_4.5rem_1fr] sm:gap-2">
          <Card
            title="In your code"
            stamped={false}
            {...(now.crossing === 'read' ? { flash: round * 10 + 2 } : {})}
          />
          <div className="flex flex-col gap-3">
            <Crossing label="save →" lit={now.crossing === 'save'} />
            <Crossing label="← read" lit={now.crossing === 'read'} />
          </div>
          <div
            className={`transition-opacity duration-300 ${now.stored ? '' : 'opacity-30'}`}
          >
            <Card
              title="Stored"
              stamped={now.stored}
              {...(now.crossing === 'save' ? { flash: round * 10 + 1 } : {})}
            />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
