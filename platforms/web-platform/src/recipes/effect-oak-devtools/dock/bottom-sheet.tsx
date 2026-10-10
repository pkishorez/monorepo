import { useState } from 'react';
import type { ReactNode } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { drag } from './drag.ts';

/** How tall the sheet is when lowered. */
export const PEEK = 64;

/**
 * A sheet at the bottom of a phone: lowered, it shows `peek`; dragged up, or
 * tapped on its grabber, it shows `children`, snapping to half or most of the
 * screen. `peek` gets a function that raises it.
 */
export const BottomSheet = ({
  label,
  peek,
  children,
}: {
  readonly label: string;
  readonly peek: (raise: () => void) => ReactNode;
  readonly children: ReactNode;
}) => {
  const stops = () => [
    PEEK,
    window.innerHeight * 0.5,
    window.innerHeight * 0.9,
  ];
  const height = useMotionValue(PEEK);
  const [raised, setRaised] = useState(false);
  const snap = (to: number) => {
    setRaised(to > PEEK);
    animate(height, to, { type: 'spring', duration: 0.4, bounce: 0.1 });
  };
  const raise = () => snap(stops()[1]!);

  return (
    <motion.aside
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.35)]"
      style={{ height }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={raised ? `Lower ${label}` : `Raise ${label}`}
        onPointerDown={(event) => {
          const from = height.get();
          drag(
            event,
            'y',
            (by) => {
              height.set(
                Math.min(Math.max(from - by, PEEK), window.innerHeight * 0.95),
              );
              setRaised(height.get() > PEEK + 24);
            },
            (moved) => {
              const now = height.get();
              if (!moved) return snap(now > PEEK ? PEEK : stops()[1]!);
              snap(
                stops().reduce((best, stop) =>
                  Math.abs(stop - now) < Math.abs(best - now) ? stop : best,
                ),
              );
            },
          );
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (raised) snap(PEEK);
          else raise();
        }}
        className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center outline-none focus-visible:bg-muted/50"
      >
        <span className="h-1 w-9 rounded-full bg-muted-foreground/40" />
      </div>
      {raised ? children : peek(raise)}
    </motion.aside>
  );
};
