import { useRef, useState, type Ref } from 'react';
import { motion, usePresence } from 'motion/react';
import { Trash2Icon } from 'lucide-react';
import { useList } from './context.ts';
import {
  DRAWN,
  ENTER,
  ENTER_S,
  EXIT_S,
  GLIDE,
  STAGGER_MAX,
  STAGGER_S,
  TRAVEL,
  useTransition,
} from './motion.ts';

/*
 * One to-do. Click anywhere on it to complete it, or make it active again.
 * It is a row in an <AnimatePresence>, and says only where it should be:
 * in the list while it is listed, out of it once it is not. Whatever
 * changes the list, a click, a filter or time travel, and however often it
 * changes its mind, the row animates there from wherever it is.
 *
 * Leaving, it steps out of the layout at once (`popLayout`) and the rows
 * below glide up into its place: completed, it swipes right towards the
 * Completed tab as its tick draws; made active, it swipes left; deleted,
 * it shrinks away.
 */

/** How a row comes in. */
export type Arrival =
  /** The list's first showing: it rises into place, in its turn. */
  | 'first'
  /** The tab changed: it comes in from the tab's side, in its turn. */
  | 'tab'
  /** Just added: it drops in at the top. */
  | 'added'
  /** From the other tab, by time travel: it comes in from that side. */
  | 'moved';

/** Which side something comes from or goes to: -1 left, 1 right. */
export type Side = -1 | 1;

export function Row({
  id,
  arrival: arriving,
  side,
  order,
  ref,
}: {
  readonly id: string;
  readonly arrival: Arrival;
  /** The side it comes in from, for `tab` and `moved`. */
  readonly side: Side;
  /** Its place in the list, for staggering. */
  readonly order: number;
  /** Set by AnimatePresence, to lift it out of the layout as it leaves. */
  readonly ref?: Ref<HTMLLIElement>;
}) {
  const { items, toggle, remove } = useList();
  const [present, safeToRemove] = usePresence();
  const transition = useTransition();
  const [arrival] = useState(arriving);
  // Staggered only the first time: brought back while leaving, it returns at once.
  const [arrived, setArrived] = useState(false);
  const latest = useRef(present);
  latest.current = present;

  // A deleted to-do is drawn as it last was.
  const live = items.get(id);
  const last = useRef(live);
  if (live) last.current = live;
  const item = live ?? last.current;
  if (!item) return null;

  // Leaving but still listed: completed, so off to the right, or active
  // again, so off to the left. Not listed: deleted.
  const moving = !present && live !== undefined;
  const away: Side = item.done ? 1 : -1;
  const turn =
    arrived || (arrival !== 'first' && arrival !== 'tab')
      ? 0
      : Math.min(order, STAGGER_MAX) * STAGGER_S +
        (arrival === 'first' ? 0.1 : 0);

  const from =
    arrival === 'added'
      ? { opacity: 0, y: -8, filter: 'blur(2px)' }
      : arrival === 'first'
        ? { opacity: 0, y: 8, filter: 'blur(2px)' }
        : { opacity: 0, x: side * TRAVEL * 0.5, filter: 'blur(2px)' };

  return (
    <motion.li
      {...DRAWN}
      ref={ref}
      // Gliding to its new place as rows come and go; leaving, it stays put.
      layout={present ? 'position' : false}
      initial={from}
      animate={
        present
          ? { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' }
          : moving
            ? {
                opacity: 0,
                x: away * TRAVEL,
                y: 0,
                scale: 1,
                filter: 'blur(0px)',
              }
            : { opacity: 0, x: 0, y: 0, scale: 0.96, filter: 'blur(0px)' }
      }
      transition={transition(
        present
          ? {
              default: { duration: ENTER_S, ease: ENTER, delay: turn },
              layout: GLIDE,
            }
          : { duration: EXIT_S, ease: ENTER },
      )}
      onAnimationComplete={(done) => {
        // Gliding into place ends too: only its own fade counts.
        if (typeof done !== 'object' || !('opacity' in done)) return;
        if (latest.current) setArrived(true);
        else safeToRemove?.();
      }}
      // Leaving, it swipes away over the rows gliding up under it.
      className={present ? 'w-full' : 'z-10 w-full'}
    >
      <div className="pb-2">
        <div className="group flex items-center rounded-2xl bg-(--pg-raised) transition-[background-color] duration-150 hover:bg-(--pg-raised-hover)">
          <button
            type="button"
            role="checkbox"
            aria-checked={item.done}
            onClick={() => toggle(id)}
            className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-2xl py-3 pl-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus)"
          >
            <Tick done={item.done} />
            <span
              className={`relative min-w-0 text-[15px] leading-snug transition-colors duration-150 ${item.done ? 'text-(--pg-text-3)' : 'text-(--pg-text)'}`}
            >
              {item.text}
              <motion.span
                {...DRAWN}
                aria-hidden
                initial={false}
                animate={{ scaleX: item.done ? 1 : 0 }}
                transition={transition(
                  item.done
                    ? { duration: 0.18, ease: ENTER }
                    : { duration: 0.14, ease: ENTER },
                )}
                className={`absolute inset-x-0 top-1/2 h-px bg-current ${item.done ? 'origin-left' : 'origin-right'}`}
              />
            </span>
          </button>
          <button
            type="button"
            aria-label={`Delete “${item.text}”`}
            onClick={() => remove(id)}
            className="mr-1.5 grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-(--pg-text-4) transition-[color,background-color] duration-150 group-hover:text-(--pg-text-3) hover:bg-(--pg-raised) hover:!text-(--pg-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) active:scale-95"
          >
            <Trash2Icon className="size-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </motion.li>
  );
}

/** A round check whose tick draws itself in as it is checked. */
function Tick({ done }: { readonly done: boolean }) {
  const transition = useTransition();
  return (
    <span
      aria-hidden
      className={`grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color] duration-150 ${done ? 'border-(--pg-accent) bg-(--pg-accent)' : 'border-(--pg-control) group-hover:border-(--pg-text-4)'}`}
    >
      <svg viewBox="0 0 24 24" className="size-3.5 text-(--pg-accent-ink)">
        <motion.path
          {...DRAWN}
          d="M20 6 9 17l-5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={transition(
            done
              ? {
                  pathLength: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
                  opacity: { duration: 0.05 },
                }
              : {
                  pathLength: { duration: 0.15, ease: [0.4, 0, 1, 1] },
                  opacity: { duration: 0.1, delay: 0.08 },
                },
          )}
        />
      </svg>
    </span>
  );
}
