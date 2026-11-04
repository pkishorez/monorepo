import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  MOVE,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * How a row reaches the screen, and how an edit goes back. Three stops in
 * a line: the Backend, the Sync Replica on this device, and the screen. A
 * fetch brings two tasks into the replica, and the Collection shows them.
 * Then the reader adds one: it shows at once, marked as saving, while the
 * Mutation Callback takes it to the Backend. The Backend answers with the
 * saved task, the replica keeps it, and the mark goes. What travels is a
 * label in the accent, gliding along a track under the stops; it arrives
 * before the rows it brings fade in. Every stop keeps room for three
 * tasks from the start.
 */

type Stop = 0 | 1 | 2;

type Step = {
  readonly backend: number;
  readonly replica: number;
  readonly screen: number;
  /** The added task is on screen, not yet confirmed. */
  readonly saving?: boolean;
  readonly moving?: {
    readonly label: string;
    readonly from: Stop;
    readonly to: Stop;
  };
  readonly caption: string;
};

const TASKS = ['Plan the week', 'Water the plants', 'Call home'];

const STEPS: ReadonlyArray<Step> = [
  {
    backend: 2,
    replica: 0,
    screen: 0,
    caption: 'The Backend holds two tasks. This device has none yet.',
  },
  {
    backend: 2,
    replica: 2,
    screen: 0,
    moving: { label: 'fetch', from: 0, to: 1 },
    caption:
      'A Sync Strategy fetches what changed, and the Sync Replica keeps it.',
  },
  {
    backend: 2,
    replica: 2,
    screen: 2,
    caption: 'The Collection shows what the Sync Replica holds, on screen.',
  },
  {
    backend: 2,
    replica: 2,
    screen: 3,
    saving: true,
    caption: 'You add a task. It shows at once, marked as saving.',
  },
  {
    backend: 2,
    replica: 2,
    screen: 3,
    saving: true,
    moving: { label: 'onInsert', from: 2, to: 0 },
    caption: 'The Mutation Callback, onInsert, sends it to the Backend.',
  },
  {
    backend: 3,
    replica: 3,
    screen: 3,
    moving: { label: 'saved', from: 0, to: 1 },
    caption:
      'The Backend’s answer is kept in the Sync Replica, and the mark goes.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

const STOPS = ['Backend', 'Sync Replica', 'Screen'] as const;

function StopCard({
  title,
  count,
  saving,
  late,
  flash,
}: {
  readonly title: string;
  readonly count: number;
  readonly saving: boolean;
  /** Its rows wait for the label travelling to it. */
  readonly late: boolean;
  readonly flash?: number;
}) {
  return (
    <div className="relative min-w-0 rounded-lg border border-border bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="mb-1.5 truncate text-[11px] font-medium">{title}</p>
      <ul className="space-y-1">
        {TASKS.map((task, index) => {
          const there = index < count;
          const marked = saving && index === count - 1;
          return (
            <motion.li
              key={task}
              initial={false}
              animate={there ? { opacity: 1, y: 0 } : { opacity: 0, y: 3 }}
              transition={
                there ? { ...ENTER, delay: late ? MOVE.duration : 0 } : EXIT
              }
              aria-hidden={!there}
              className={`truncate rounded border px-1.5 text-[10.5px] leading-[18px] transition-colors duration-300 ${marked ? 'border-dashed border-(--field-accent) text-muted-foreground' : 'border-border'}`}
            >
              {task}
            </motion.li>
          );
        })}
      </ul>
      <Flash at={flash} />
    </div>
  );
}

export function FlowPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  const counts = [now.backend, now.replica, now.screen] as const;
  return (
    <Walkthrough walk={walk}>
      <div className="px-3 py-8 sm:px-8">
        <div className="mx-auto max-w-lg">
          <div className="grid grid-cols-3 gap-3 sm:gap-6">
            {STOPS.map((title, index) => (
              <StopCard
                key={title}
                title={title}
                count={counts[index]!}
                saving={index === 2 && now.saving === true}
                late={now.moving?.to === index}
                flash={step === 2 && index === 2 ? round * 10 + 2 : undefined}
              />
            ))}
          </div>
          <div className="relative mt-3 h-6">
            <AnimatePresence>
              {now.moving && (
                <motion.div
                  key={`${round}-${step}`}
                  className="absolute inset-y-0 left-0 flex w-1/3 justify-center"
                  initial={{ x: `${now.moving.from * 100}%`, opacity: 0 }}
                  animate={{
                    x: `${now.moving.to * 100}%`,
                    opacity: 1,
                    transition: {
                      x: MOVE,
                      opacity: { duration: 0.15, ease: 'easeOut' },
                    },
                  }}
                  exit={{ opacity: 0, transition: EXIT }}
                >
                  <span className="rounded-full border border-(--field-accent) bg-background px-2 font-mono text-[10px] leading-5 text-(--field-accent)">
                    {now.moving.label}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
