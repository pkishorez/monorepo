import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createPortal } from 'react-dom';
import type { Item } from './item.ts';
import { LiftHint } from './lift-hint.tsx';
import { List } from './list.tsx';
import { clamp, stepsOf } from './steps.ts';

const EASE = [0.23, 1, 0.32, 1] as const;
const SPRING = { type: 'spring', duration: 0.18, bounce: 0.15 } as const;
const AT_ONCE = { duration: 0 } as const;

/**
 * Where a vertical travel, in px and down being more, has Stepped to among
 * `count` items from the one at `start`: the `steps` taken, none short of
 * `first` px, the `index` they reach, held at either end, and whether
 * they went `past` it.
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
}) => {
  const steps = stepsOf(travel, first);
  const index = clamp(count, start + steps);
  return { steps, index, past: index !== start + steps };
};

/**
 * Where letting go will take you, at the top centre of the screen and
 * never under the fingers: the Lift Hint naming the marked item, or, as
 * a `list`, every item in order with the marked one and the `start` both
 * shown. It grows from one to the other and shrinks away once nothing is
 * marked. Motion is a short spring on transform and opacity, and none for
 * those who ask for less.
 */
export function PlacePicker(props: {
  readonly items: ReadonlyArray<Item>;
  readonly start: string;
  readonly marked: string | undefined;
  readonly past: boolean;
  readonly list: boolean;
}) {
  const still = useReducedMotion() === true;
  const move = still ? AT_ONCE : SPRING;
  const item = props.items.find((each) => each.id === props.marked);
  if (typeof document === 'undefined') return null;
  return createPortal(
    // Its own view transition name keeps it still while the page slides.
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[100] flex justify-center px-4 [view-transition-class:still] [view-transition-name:lift-hint]"
    >
      <AnimatePresence>
        {item && (
          <motion.div
            layout
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              scale: 0.95,
              transition: still ? AT_ONCE : { duration: 0.15, ease: EASE },
            }}
            transition={move}
            style={{ borderRadius: 16 }}
            className="overflow-hidden border bg-popover text-sm text-popover-foreground shadow-md"
          >
            <motion.div
              key={props.list ? 'list' : 'hint'}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={still ? AT_ONCE : { duration: 0.12, ease: EASE }}
            >
              {props.list ? (
                <List
                  items={props.items}
                  marked={item.id}
                  start={props.start}
                  past={props.past}
                  move={move}
                />
              ) : (
                <LiftHint item={item} past={props.past} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
