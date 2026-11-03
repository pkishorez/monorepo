import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * How a row reaches the screen, and how an edit goes back. Three stops in
 * a line: the Backend, the Sync Replica on this device, and the screen. A
 * fetch brings two tasks into the replica, and the Collection shows them.
 * Then the reader adds one: it shows at once, marked as saving, while the
 * Mutation Callback takes it to the Backend. The Backend answers with the
 * saved task, the replica keeps it, and the mark goes.
 */

type Step = {
  readonly backend: number;
  readonly replica: number;
  readonly screen: number;
  /** The added task is on screen, not yet confirmed. */
  readonly saving?: boolean;
  readonly moving?: {
    readonly label: string;
    readonly from: 0 | 1 | 2;
    readonly to: 0 | 1 | 2;
  };
  readonly line: string;
};

const TASKS = ['Plan the week', 'Water the plants', 'Call home'];

const STEPS: ReadonlyArray<Step> = [
  { backend: 2, replica: 0, screen: 0, line: 'the Backend holds two tasks' },
  {
    backend: 2,
    replica: 0,
    screen: 0,
    moving: { label: 'fetch', from: 0, to: 1 },
    line: 'a Sync Strategy fetches what changed',
  },
  {
    backend: 2,
    replica: 2,
    screen: 2,
    line: 'kept in the Sync Replica, shown by the Collection',
  },
  {
    backend: 2,
    replica: 2,
    screen: 3,
    saving: true,
    line: 'you add one: it shows at once',
  },
  {
    backend: 2,
    replica: 2,
    screen: 3,
    saving: true,
    moving: { label: 'onInsert', from: 2, to: 0 },
    line: 'the Mutation Callback sends it to the Backend',
  },
  {
    backend: 3,
    replica: 3,
    screen: 3,
    moving: { label: 'saved', from: 0, to: 1 },
    line: 'the Backend’s answer is kept, and the mark goes',
  },
];
const DURATIONS = [1200, 1200, 1700, 1500, 1400, 2200];

const STOPS = ['Backend', 'Sync Replica', 'Screen'] as const;

function Stop({
  title,
  count,
  saving = false,
  flash,
}: {
  readonly title: string;
  readonly count: number;
  readonly saving?: boolean;
  readonly flash?: number;
}) {
  return (
    <div className="relative min-w-0 rounded-lg border border-border bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="mb-1.5 truncate text-[11px] font-medium">{title}</p>
      <ul className="min-h-[4.25rem] space-y-1">
        <AnimatePresence initial={false}>
          {TASKS.slice(0, count).map((task, index) => (
            <motion.li
              key={task}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
              className={`truncate rounded border px-1.5 text-[10.5px] leading-[18px] transition-colors duration-300 ${saving && index === count - 1 ? 'border-dashed border-foreground/40 text-muted-foreground' : 'border-border'}`}
            >
              {task}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <Flash {...(flash ? { at: flash } : {})} />
    </div>
  );
}

export function FlowPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const now = STEPS[step]!;
  const counts = [now.backend, now.replica, now.screen] as const;
  return (
    <div ref={ref} className="px-3 py-8 sm:px-8">
      <div className="mx-auto max-w-lg">
        <div className="relative grid grid-cols-3 gap-3 sm:gap-6">
          {STOPS.map((title, index) => (
            <Stop
              key={title}
              title={title}
              count={counts[index]!}
              saving={index === 2 && now.saving === true}
              {...(step === 2 && index > 0 ? { flash: round * 10 + 2 } : {})}
            />
          ))}
        </div>
        <div className="relative mt-3 h-6">
          <AnimatePresence>
            {now.moving && (
              <motion.span
                key={`${round}-${step}`}
                initial={{
                  left: `${now.moving.from * 33.3 + 16.6}%`,
                  opacity: 0,
                }}
                animate={{
                  left: `${now.moving.to * 33.3 + 16.6}%`,
                  opacity: 1,
                  transition: { duration: 0.9, ease: [0.77, 0, 0.175, 1] },
                }}
                exit={{ opacity: 0, transition: EXIT }}
                className="absolute top-0 -translate-x-1/2 rounded-full border border-border bg-background px-2 font-mono text-[10px] leading-5"
              >
                {now.moving.label}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-3 h-4 text-center font-mono text-[11px] text-muted-foreground">
          <AnimatePresence mode="wait">
            <motion.span
              key={`${round}-${step}`}
              className="inline-block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
            >
              {now.line}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>
    </div>
  );
}
