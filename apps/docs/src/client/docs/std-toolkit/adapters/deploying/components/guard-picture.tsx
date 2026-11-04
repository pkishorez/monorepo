import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * Two deploys meet the Deploy guard. On the left, the versions last
 * shipped; on the right, the ones this deploy brings, the new one lit.
 * The first adds a version: the guard lets it through and the table is
 * set up, lit as it is. The second edits a version that already shipped:
 * the guard shakes and fails the deploy, and the table is never touched.
 * Every line keeps its height, so the picture never grows.
 */

type Version = { readonly name: string; readonly edited?: boolean };

type Step = {
  readonly next: ReadonlyArray<Version>;
  readonly verdict?: 'passed' | 'failed';
  readonly table: string;
  readonly caption: string;
};

const SHIPPED: ReadonlyArray<Version> = [{ name: 'v1' }, { name: 'v2' }];

const STEPS: ReadonlyArray<Step> = [
  {
    next: [{ name: 'v1' }, { name: 'v2' }, { name: 'v3' }],
    table: 'waiting for the guard',
    caption:
      'This deploy adds v3 to Task. The Deploy guard compares it with what last shipped.',
  },
  {
    next: [{ name: 'v1' }, { name: 'v2' }, { name: 'v3' }],
    verdict: 'passed',
    table: 'set up at v3',
    caption:
      'A new version leaves every stored row readable, so the guard lets it through and the table is set up.',
  },
  {
    next: [{ name: 'v1' }, { name: 'v2', edited: true }],
    table: 'waiting for the guard',
    caption: 'The next deploy edits v2, a version that already shipped.',
  },
  {
    next: [{ name: 'v1' }, { name: 'v2', edited: true }],
    verdict: 'failed',
    table: 'untouched',
    caption:
      'Rows saved at v2 would no longer read, so the guard fails the deploy before the table is touched.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

function Versions({
  title,
  versions,
  lit,
}: {
  readonly title: string;
  readonly versions: ReadonlyArray<Version>;
  /** The version this deploy brings new, if it should be lit. */
  readonly lit?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {title}
      </p>
      <div className="flex h-9 items-center gap-1.5 overflow-hidden rounded-lg border border-border bg-background px-2.5 whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <span className="mr-0.5 text-[12px] font-medium">Task</span>
        <AnimatePresence initial={false} mode="popLayout">
          {versions.map((version) => (
            <motion.span
              key={`${version.name}${version.edited ? '*' : ''}`}
              layout="position"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
              className={`rounded px-1 font-mono text-[10px] transition-colors duration-300 ${version.edited ? 'border border-red-500 text-red-600 dark:text-red-400' : version.name === lit ? 'bg-(--field-accent) text-background' : 'bg-foreground text-background'}`}
            >
              {version.name}
              {version.edited && ' edited'}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function GuardPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-md">
          <div className="grid grid-cols-2 gap-3">
            <Versions title="Last shipped" versions={SHIPPED} />
            <Versions
              title="This deploy"
              versions={now.next}
              {...(step === 0 ? { lit: 'v3' } : {})}
            />
          </div>
          <div className="mt-4 flex h-8 items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: now.verdict === 'failed' ? [0, -5, 5, -3, 3, 0] : 0,
                  transition:
                    now.verdict === 'failed' ? { duration: 0.4 } : ENTER,
                }}
                exit={{ opacity: 0, transition: EXIT }}
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap ${now.verdict === 'failed' ? 'border-red-500 text-red-600 dark:text-red-400' : now.verdict === 'passed' ? 'border-border' : 'border-transparent text-muted-foreground'}`}
              >
                Deploy guard:{' '}
                {now.verdict === 'passed'
                  ? 'passed'
                  : now.verdict === 'failed'
                    ? 'failed'
                    : 'comparing…'}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="mx-auto h-4 w-px bg-border" />
          <div className="relative rounded-lg border border-dashed border-border px-3 py-2 text-center text-[12px] whitespace-nowrap">
            <span className="font-medium">board</span>{' '}
            <span className="font-mono text-[11px] text-muted-foreground">
              table: {now.table}
            </span>
            <Flash
              at={now.verdict === 'passed' ? round * 10 + step : undefined}
            />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
