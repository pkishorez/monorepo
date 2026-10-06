import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createPortal } from 'react-dom';
import { List } from './list.tsx';
import type { Choice } from './tree.ts';

const EASE = [0.23, 1, 0.32, 1] as const;
const SPRING = { type: 'spring', duration: 0.18, bounce: 0.15 } as const;
const SLIDE = { type: 'spring', duration: 0.28, bounce: 0.1 } as const;
const FADE = { duration: 0.16, ease: EASE } as const;
const AT_ONCE = { duration: 0 } as const;
// How far, in px, each list behind the open one sits to the top left.
const BEHIND = { x: -104, y: -28 } as const;

/** One list on the way down, and what in it is marked and where you are. */
export type Column = {
  readonly id: string;
  readonly choices: ReadonlyArray<Choice>;
  readonly marked: number;
  readonly here: number | undefined;
};

/**
 * Where letting go will take you, at the top centre of the screen and
 * never under the fingers, over everything else dimmed and blurred: the
 * open list in the middle, and each list it was opened from drawn back to
 * the top left, smaller and fainter. It zooms in as it shows; an opened
 * list slides in from the right and slides back out as the swipe goes
 * back. None of it moves for those who ask for less motion.
 */
export function Menu(props: {
  readonly columns: ReadonlyArray<Column> | undefined;
}) {
  const still = useReducedMotion() === true;
  if (typeof document === 'undefined') return null;
  const columns = props.columns ?? [];
  const last = columns.length - 1;
  return createPortal(
    <AnimatePresence>
      {props.columns !== undefined && (
        <motion.div
          key="scrim"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={still ? AT_ONCE : FADE}
          className="pointer-events-none fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm"
        />
      )}
      {props.columns !== undefined && (
        <motion.div
          key="menu"
          aria-live="polite"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={still ? AT_ONCE : FADE}
          className="pointer-events-none fixed top-[calc(env(safe-area-inset-top)+6rem)] left-1/2 z-[100] origin-top text-sm text-popover-foreground"
        >
          <AnimatePresence initial={false}>
            {columns.map((column, depth) => {
              const back = last - depth;
              return (
                <motion.div
                  key={column.id}
                  style={{ zIndex: depth }}
                  initial={{ opacity: 0, x: 56, scale: 0.96 }}
                  animate={{
                    opacity: back === 0 ? 1 : 0.5,
                    x: back * BEHIND.x,
                    y: back * BEHIND.y,
                    scale: 1 - back * 0.1,
                  }}
                  exit={{ opacity: 0, x: 56, scale: 0.96 }}
                  transition={still ? AT_ONCE : SLIDE}
                  // Centred by `translate`, apart from the motion's `transform`.
                  className="absolute top-0 left-0 origin-top-left -translate-x-1/2 rounded-2xl border bg-popover shadow-lg"
                >
                  <List
                    id={column.id}
                    choices={column.choices}
                    marked={column.marked}
                    here={column.here}
                    move={still ? AT_ONCE : SPRING}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
