import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Pill,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * The snapshot you shipped beside the one you are about to ship. They
 * start the same. Then, one at a time, a change is made to the next one:
 * the changed line slides in, lit, and a beat later the diff gives its
 * verdict under them. A new version is safe, an edited version is
 * breaking, a new index needs a reindex. Both cards keep room for five
 * lines, so a change never makes them taller; on a phone they stack.
 */

type Change = {
  readonly lines: ReadonlyArray<string>;
  /** Which line is new or edited. */
  readonly changed?: number;
  readonly impact?: 'safe' | 'breaking' | 'requires-reindex';
  readonly caption: string;
};

const SHIPPED = ['Task', '  v1  boardId, title', 'patterns', '  primary'];

const CHANGES: ReadonlyArray<Change> = [
  {
    lines: SHIPPED,
    caption:
      'The snapshot you shipped, beside the one you are about to ship. So far they match.',
  },
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
    caption:
      'Add a version, v2, with priority. That is safe: every row you shipped still reads.',
  },
  {
    lines: ['Task', '  v1  boardId, title, priority', 'patterns', '  primary'],
    changed: 1,
    impact: 'breaking',
    caption:
      'Write priority straight into v1 instead. That is breaking: rows saved at v1 no longer read.',
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
    impact: 'requires-reindex',
    caption:
      'Add an index, byTitle. Rows saved before it have no key there, so it requires a reindex, which setup runs.',
  },
];
const CAPTIONS = CHANGES.map((each) => each.caption);

/** Every card has room for this many lines. */
const LINES = 5;

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
        {Array.from({ length: LINES }, (_, index) => lines[index] ?? '').map(
          (line, index) => (
            <motion.p
              key={`${line}-${index}`}
              initial={index === changed ? { opacity: 0, x: -6 } : false}
              animate={{ opacity: 1, x: 0, transition: ENTER }}
              className={`h-5 overflow-hidden text-ellipsis whitespace-pre ${index === changed ? '-mx-1 rounded px-1 text-(--field-accent)' : ''}`}
            >
              {line}
            </motion.p>
          ),
        )}
      </div>
    </div>
  );
}

export function DiffPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const change = CHANGES[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto grid max-w-lg gap-4 sm:grid-cols-2">
          <Card title="shipped" lines={SHIPPED} />
          <Card
            key={`${round}-${step}`}
            title="about to ship"
            lines={change.lines}
            {...(change.changed === undefined
              ? {}
              : { changed: change.changed })}
          />
        </div>
        <p className="mt-5 flex h-6 items-center justify-center">
          <AnimatePresence mode="wait">
            {change.impact && (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { ...ENTER, delay: 0.45 },
                }}
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
    </Walkthrough>
  );
}
