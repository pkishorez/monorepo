import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createPortal } from 'react-dom';
import type { Item } from './item.ts';
import { List } from './list.tsx';
import { clamp, stepsOf } from './steps.ts';

const EASE = [0.23, 1, 0.32, 1] as const;
const SPRING = { type: 'spring', duration: 0.18, bounce: 0.15 } as const;
const FADE = { duration: 0.14, ease: EASE } as const;
const AT_ONCE = { duration: 0 } as const;

/**
 * The item a vertical travel, in px and down being more, has Stepped to
 * among `count` from the one at `start`: no Step short of `first` px, then
 * one more each STEP px, held at either end.
 */
export const pick = ({
  count,
  start,
  travel,
  first,
}: {
  readonly count: number;
  readonly start: number;
  readonly travel: number;
  readonly first: number;
}) => clamp(count, start + stepsOf(travel, first));

/**
 * Where letting go will take you, at the top centre of the screen and
 * never under the fingers: every item in order, the marked one and the
 * `start` both shown, from the moment something is marked until nothing
 * is. Motion is a short spring on transform and opacity, and none for
 * those who ask for less.
 */
export function PlacePicker(props: {
  readonly items: ReadonlyArray<Item>;
  readonly start: string;
  readonly marked: string | undefined;
}) {
  const still = useReducedMotion() === true;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[100] flex justify-center px-4"
    >
      <AnimatePresence>
        {props.marked !== undefined && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={still ? AT_ONCE : FADE}
            className="origin-top rounded-2xl border bg-popover text-sm text-popover-foreground shadow-md"
          >
            <List
              items={props.items}
              marked={props.marked}
              start={props.start}
              move={still ? AT_ONCE : SPRING}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
