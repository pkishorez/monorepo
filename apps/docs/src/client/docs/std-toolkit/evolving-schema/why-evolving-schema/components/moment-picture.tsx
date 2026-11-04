import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * Two changes to the same shape, one above the other. Above, an API: the
 * server and the app that calls it move from v1 to v2 together, and once
 * the deploy is done nothing in v1 is left. Below, saved data: the code
 * moves to v2, but the row it saved last month stays v1, and the next read
 * finds a field missing. Each step changes one row of cards, and only
 * their version badges move.
 */

type Step = {
  readonly api: 'v1' | 'v2';
  readonly code: 'v1' | 'v2';
  readonly missing?: boolean;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    api: 'v1',
    code: 'v1',
    caption: 'An API and some saved data, both in the v1 shape.',
  },
  {
    api: 'v2',
    code: 'v1',
    caption:
      'An API changes at a moment: the server and the app calling it ship v2 together.',
  },
  {
    api: 'v2',
    code: 'v2',
    caption: 'Saved data is different. Your code ships v2 as well.',
  },
  {
    api: 'v2',
    code: 'v2',
    missing: true,
    caption:
      'But the row it saved last month is still v1, and the next read finds a field missing.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

function Card({
  label,
  version,
  flash,
  warn = false,
}: {
  readonly label: string;
  readonly version: string;
  readonly flash?: number;
  readonly warn?: boolean;
}) {
  return (
    <div
      className={`relative flex h-10 items-center justify-between gap-2 rounded-lg border bg-background px-3 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-300 ${warn ? 'border-red-500' : 'border-border'}`}
    >
      <span className="truncate font-medium">{label}</span>
      <span className="inline-grid shrink-0">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={version}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: ENTER }}
            exit={{ opacity: 0, y: 6, transition: EXIT }}
            className="rounded bg-foreground px-1 font-mono text-[10px] text-background"
          >
            {version}
          </motion.span>
        </AnimatePresence>
      </span>
      <Flash at={flash} />
    </div>
  );
}

export function MomentPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  const at = (when: number) => (step === when ? round * 10 + when : undefined);
  return (
    <Walkthrough walk={walk}>
      <div className="space-y-6 px-4 py-8 sm:px-10">
        <div className="mx-auto max-w-md space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            An API: a moment
          </p>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Card label="Server" version={now.api} flash={at(1)} />
            <Card label="App calling it" version={now.api} flash={at(1)} />
          </div>
        </div>
        <div className="mx-auto max-w-md space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            Saved data: it stays
          </p>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Card label="Your code" version={now.code} flash={at(2)} />
            <Card
              label="A saved row"
              version="v1"
              warn={now.missing === true}
            />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
