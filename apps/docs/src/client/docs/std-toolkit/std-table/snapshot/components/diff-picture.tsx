import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Pill,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * The snapshot you shipped beside the one you are about to ship. Each
 * round, one change is made to the next one, and the diff judges it:
 * a new version is safe, an edited version is breaking, a new index
 * needs a backfill. The changed line is the only thing that moves.
 */

type Change = {
  readonly lines: ReadonlyArray<string>;
  /** Which line is new or edited. */
  readonly changed: number;
  readonly impact: 'safe' | 'breaking' | 'requires-backfill';
};

const SHIPPED = ['Task', '  v1  boardId, title', 'patterns', '  primary'];

const CHANGES: ReadonlyArray<Change> = [
  {
    lines: [
      'Task',
      '  v1  boardId, title',
      '  v2  + priority',
      'patterns',
      '  primary',
    ],
    changed: 2,
    impact: 'safe',
  },
  {
    lines: ['Task', '  v1  boardId, title, priority', 'patterns', '  primary'],
    changed: 1,
    impact: 'breaking',
  },
  {
    lines: [
      'Task',
      '  v1  boardId, title',
      'patterns',
      '  primary',
      '  byTitle',
    ],
    changed: 4,
    impact: 'requires-backfill',
  },
];

/** Each change: it appears, then its verdict. */
const DURATIONS = CHANGES.flatMap(() => [1100, 1900]);

function Card({
  title,
  lines,
  changed,
}: {
  readonly title: string;
  readonly lines: ReadonlyArray<string>;
  readonly changed?: number;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[11px] font-medium text-muted-foreground">
        {title}
      </p>
      <div className="rounded-xl border border-border bg-background p-3 font-mono text-[11px] leading-5">
        {lines.map((line, index) => (
          <motion.p
            key={`${line}-${index}`}
            initial={index === changed ? { opacity: 0, x: -6 } : false}
            animate={{ opacity: 1, x: 0, transition: ENTER }}
            className={`overflow-hidden text-ellipsis whitespace-pre ${index === changed ? 'rounded bg-muted px-1 -mx-1 text-foreground' : ''}`}
          >
            {line}
          </motion.p>
        ))}
      </div>
    </div>
  );
}

export function DiffPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const change = CHANGES[Math.floor(step / 2)]!;
  const judged = step % 2 === 1;
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto grid max-w-lg grid-cols-2 gap-4">
        <Card title="shipped" lines={SHIPPED} />
        <Card
          key={`${round}-${step >> 1}`}
          title="about to ship"
          lines={change.lines}
          changed={change.changed}
        />
      </div>
      <p className="mt-5 flex h-6 items-center justify-center">
        <AnimatePresence mode="wait">
          {judged && (
            <motion.span
              key={`${round}-${step}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
            >
              <Pill
                className={
                  change.impact === 'breaking'
                    ? 'border-red-500 text-red-600 dark:text-red-400'
                    : ''
                }
              >
                {change.impact}
              </Pill>
            </motion.span>
          )}
        </AnimatePresence>
      </p>
    </div>
  );
}
