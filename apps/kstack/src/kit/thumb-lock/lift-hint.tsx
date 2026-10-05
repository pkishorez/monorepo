import { AnimatePresence, motion } from 'motion/react';
import type { Reading, Way } from './recognize.ts';

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * The Command a Thumb Lock will run, named at the top of the screen once
 * the swipe has gone far enough to arm it: "Let go | Add an entry". It
 * slides in with a small spring, goes again if the finger comes back
 * short, and confirms with a pop as the Command runs. Before arming, and
 * on a Wrong Way, nothing shows: the fingers keep the screen.
 */
export function LiftHint(props: {
  readonly lock:
    | { readonly reading: Reading; readonly ran?: boolean }
    | undefined;
  readonly commands: Readonly<Record<Way, { readonly label: string }>>;
}) {
  const reading = props.lock?.reading;
  const ran = props.lock?.ran === true;
  const armed =
    reading?.kind === 'going' && (reading.armed || ran)
      ? reading.way
      : undefined;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[100] flex justify-center px-4"
    >
      <AnimatePresence>
        {armed && (
          <motion.div
            key={armed}
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={
              ran
                ? { opacity: 1, y: 0, scale: [1, 1.06, 1] }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={{
              opacity: 0,
              y: ran ? 0 : -6,
              scale: ran ? 1 : 0.96,
              transition: { duration: 0.16, ease: EASE },
            }}
            transition={
              ran
                ? { duration: 0.24, ease: EASE }
                : { type: 'spring', duration: 0.34, bounce: 0.35 }
            }
            className="flex items-center gap-2 rounded-full border bg-popover py-1.5 pr-3.5 pl-3 text-sm text-popover-foreground shadow-md"
          >
            <span className="text-muted-foreground">Let go</span>
            <span className="h-3.5 w-px bg-border" />
            <span className="font-medium">{props.commands[armed].label}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
