import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Message,
  Roll,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * The one Settings record. Before anything is saved, a read gives its
 * default, drawn dashed: nothing is in the table. An update merges into
 * that default and saves it, and the record turns solid. Reset puts the
 * default back, as a real saved record, so it stays solid.
 */

type Step = {
  readonly call?: string;
  readonly theme: 'light' | 'dark';
  readonly saved: boolean;
  readonly writes: number;
  readonly note: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    theme: 'light',
    saved: false,
    writes: 0,
    note: 'nothing saved: the default',
  },
  {
    call: "getAndUpdate { theme: 'dark' }",
    theme: 'light',
    saved: false,
    writes: 0,
    note: 'nothing saved: the default',
  },
  {
    theme: 'dark',
    saved: true,
    writes: 1,
    note: 'merged into the default, saved',
  },
  { call: 'reset()', theme: 'dark', saved: true, writes: 1, note: 'saved' },
  {
    theme: 'light',
    saved: true,
    writes: 2,
    note: 'the default, saved as a record',
  },
];
const DURATIONS = [1600, 900, 1800, 900, 2000];

export function DefaultPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 2);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-72">
        <div className="flex h-9 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {now.call && (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, y: 14, transition: EXIT }}
              >
                <Message>{now.call}</Message>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div
          className={`relative mt-3 rounded-xl border bg-background p-4 font-mono text-[11.5px] leading-5 transition-colors duration-300 ${now.saved ? 'border-border shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'border-dashed border-muted-foreground/50'}`}
        >
          <p className="mb-1 font-sans text-[12px] font-medium">Settings</p>
          <p>
            <span className="text-muted-foreground">theme </span>'
            <Roll value={now.theme} />'
          </p>
          <p>
            <span className="text-muted-foreground">weekStartsOn </span>'monday'
          </p>
          <Flash at={now.writes === 0 ? 0 : round * 10 + now.writes} />
        </div>
        <p className="mt-3 h-4 text-center font-mono text-[11px] text-muted-foreground">
          <AnimatePresence mode="wait">
            <motion.span
              key={now.note}
              className="inline-block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
            >
              {now.note}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>
    </div>
  );
}
