import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Message,
  Roll,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * The one Settings record, and the call made on it each step, fading in
 * above it. Before anything is saved, a read gives its default, drawn
 * dashed: nothing is in the table. An update merges into that default
 * and saves it, and the record turns solid. Reset puts the default back,
 * as a real saved record, so it stays solid. Each write lights the card.
 */

type Step = {
  readonly call: string;
  readonly theme: 'light' | 'dark';
  readonly saved: boolean;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    call: 'get()',
    theme: 'light',
    saved: false,
    caption:
      'Nothing is saved yet. A read still gives the default, drawn dashed: the table is empty.',
  },
  {
    call: "getAndUpdate({ theme: 'dark' })",
    theme: 'dark',
    saved: true,
    caption:
      'getAndUpdate merges the new theme into the default and saves it. Now there is a record.',
  },
  {
    call: 'reset()',
    theme: 'light',
    saved: true,
    caption:
      'reset saves the default back. It is a real record now, so it stays solid.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

export function DefaultPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="grid place-items-center px-4 py-8">
        <div className="w-full max-w-72">
          <div className="grid h-9 place-items-end justify-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                <Message>settings.{now.call}</Message>
              </motion.span>
            </AnimatePresence>
          </div>
          <div
            className={`relative mt-3 rounded-xl border bg-background p-4 font-mono text-[11.5px] leading-5 transition-colors duration-300 ${now.saved ? 'border-border shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'border-dashed border-muted-foreground/50'}`}
          >
            <p className="mb-1 flex items-center justify-between font-sans text-[12px] font-medium">
              Settings
              <span className="inline-grid font-mono text-[10px] font-normal text-muted-foreground">
                <Roll value={now.saved ? 'saved' : 'the default'} />
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">theme </span>'
              <Roll value={now.theme} />'
            </p>
            <p>
              <span className="text-muted-foreground">weekStartsOn </span>
              'monday'
            </p>
            <Flash {...(now.saved ? { at: round * 10 + step } : {})} />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
