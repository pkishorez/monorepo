import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Roll,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * A versioned value has no fields to hang `_v` on, so it travels in an
 * envelope. A v1 theme arrives as the text 'night'. Read, the migration
 * turns it into the word 'dark', and the value lights. Saved, an envelope
 * fades in around it, carrying the latest version beside it. The
 * envelope's parts hold their room from the start, so the value never
 * moves.
 */

type Step = {
  readonly text: string;
  readonly wrapped: boolean;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    text: "'night'",
    wrapped: false,
    caption:
      "In v1 the theme was free text, saved as 'night'. A bare text has no room for _v.",
  },
  {
    text: "'dark'",
    wrapped: false,
    caption:
      "A read runs the migration v1 → v2: 'night' becomes the word 'dark'.",
  },
  {
    text: "'dark'",
    wrapped: true,
    caption:
      'Saving wraps it in a value envelope: the value, with its version beside it.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

export function EnvelopePicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  const part = {
    initial: false,
    animate: { opacity: now.wrapped ? 1 : 0 },
    transition: now.wrapped ? ENTER : EXIT,
    'aria-hidden': !now.wrapped,
  } as const;
  return (
    <Walkthrough walk={walk}>
      <div className="grid place-items-center px-4 py-10">
        <div
          className={`relative flex h-12 items-center gap-2 rounded-lg border px-3 font-mono text-[12px] transition-colors duration-300 ${now.wrapped ? 'border-border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'border-transparent'}`}
        >
          <motion.span
            {...part}
            className="whitespace-nowrap text-muted-foreground"
          >
            {"{ _v: 'v2', _value:"}
          </motion.span>
          <span className="relative rounded border border-border px-1.5 py-0.5">
            <Roll value={now.text} />
            <Flash {...(step === 1 ? { at: round * 10 + 1 } : {})} />
          </span>
          <motion.span {...part} className="text-muted-foreground">
            {'}'}
          </motion.span>
          <Flash {...(step === 2 ? { at: round * 10 + 2 } : {})} />
        </div>
      </div>
    </Walkthrough>
  );
}
