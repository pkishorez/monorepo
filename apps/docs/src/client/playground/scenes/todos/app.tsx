import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { PlusIcon } from 'lucide-react';
import { View } from '@kestack/kabuki/react';
import { Lamp } from '@kestack/dune/react';
import { ACCENT_HEX } from '../../kit/index.ts';
import { ListContext, type List } from './context.ts';
import {
  DRAWN,
  ENTER,
  ENTER_S,
  EXIT_S,
  GLIDE,
  MOVE,
  TRAVEL,
  useTransition,
} from './motion.ts';
import { Row, type Arrival, type Side } from './row.tsx';
import { TimelineBar, useTimeline } from './timeline.tsx';
import { FILTERS, TodosLive, type Filter, type Item } from './todos.ts';

/*
 * Draws the list the Actor hands it, now or at any past Step: a field to
 * add a to-do, a tab for active and one for completed, and a row for each
 * to-do on the tab. It holds nothing but the text being typed; every
 * change is a Message, so time travel redraws it all, and the rows that
 * differ leave or arrive on the way.
 */

/** The tab pill gliding to the tab chosen. */
const PILL = { duration: 0.24, ease: MOVE } as const;

const EMPTY: Readonly<Record<Filter, { title: string; hint: string }>> = {
  Active: {
    title: 'Nothing left to do',
    hint: 'Add a to-do above, or enjoy the quiet.',
  },
  Completed: {
    title: 'Nothing completed yet',
    hint: 'Click a to-do in Active to complete it.',
  },
};

const TodosView = View.make(TodosLive, ({ _tag, model, send, root }) => {
  const [text, setText] = useState('');
  const field = useId();
  const tab = useId();
  const items = model.items;
  const done = items.filter((item) => item.done).length;
  const counts: Readonly<Record<Filter, number>> = {
    Active: items.length - done,
    Completed: done,
  };
  const list = useMemo<List>(
    () => ({
      items: new Map(items.map((item) => [item.id, item])),
      toggle: (id) => send({ _tag: 'Toggled', id }),
      remove: (id) => send({ _tag: 'Removed', id }),
    }),
    [items, send],
  );
  // Which way the tabs moved: the next tab's rows come in from its side.
  const [onShow, setOnShow] = useState(_tag);
  const [side, setSide] = useState<Side>(1);
  if (onShow !== _tag) {
    setOnShow(_tag);
    setSide(FILTERS.indexOf(_tag) > FILTERS.indexOf(onShow) ? 1 : -1);
  }

  // The first list the app shows rises row by row; later ones come in
  // from their tab's side.
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);

  // Shown a past Step, the list can be looked at, not changed.
  const timeline = useTimeline();
  const past = timeline ? !timeline.live : false;

  const add = () => {
    const value = text.trim();
    if (!value) return;
    if (_tag !== 'Active') send({ _tag: 'Filtered', to: 'Active' });
    send({ _tag: 'Added', text: value });
    setText('');
  };

  return (
    <MotionConfig reducedMotion="user">
      <ListContext.Provider value={list}>
        <div
          {...root}
          className="mx-auto flex h-full w-full max-w-[640px] flex-col gap-4 text-(--pg-text-2)"
        >
          <section
            aria-label="Add a to-do"
            inert={past}
            className="rounded-3xl bg-(--pg-raised) p-5"
          >
            <h1 className="text-2xl font-semibold tracking-tight text-(--pg-text)">
              To-dos
            </h1>
            <form
              className="mt-4 flex items-center gap-2 rounded-2xl bg-(--pg-sunken) p-1.5 pl-4 outline-(--pg-focus) focus-within:outline-2"
              onSubmit={(event) => {
                event.preventDefault();
                add();
              }}
            >
              <label htmlFor={field} className="sr-only">
                New to-do
              </label>
              <input
                id={field}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="What needs doing?"
                autoComplete="off"
                maxLength={120}
                className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-(--pg-text) outline-none placeholder:text-(--pg-text-4)"
              />
              <Lamp
                color={ACCENT_HEX}
                intensity={text.trim() ? 1.4 : 0.3}
                reach={text.trim() ? 260 : 160}
              >
                <button
                  type="submit"
                  disabled={!text.trim()}
                  className="flex h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-(--pg-accent) px-4 text-sm font-semibold text-(--pg-accent-ink) transition-[background-color,color,transform] duration-150 hover:bg-(--pg-accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) active:scale-[0.97] disabled:cursor-default disabled:bg-(--pg-raised) disabled:text-(--pg-text-4)"
                >
                  <PlusIcon className="size-4" strokeWidth={2.25} />
                  Add
                </button>
              </Lamp>
            </form>
          </section>

          <div className="flex items-center justify-between gap-2 rounded-2xl bg-(--pg-sunken) p-1">
            <div role="tablist" aria-label="Show" inert={past} className="flex">
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={_tag === filter}
                  onClick={() => send({ _tag: 'Filtered', to: filter })}
                  className="relative flex h-9 cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm text-(--pg-text-3) transition-colors duration-150 hover:text-(--pg-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) aria-selected:text-(--pg-text)"
                >
                  {_tag === filter && (
                    <motion.span
                      {...DRAWN}
                      layoutId={tab}
                      transition={PILL}
                      className="absolute inset-0 rounded-xl bg-(--pg-raised-hover)"
                    />
                  )}
                  <span className="relative font-medium">{filter}</span>
                  <span className="relative text-xs text-(--pg-text-3) tabular-nums">
                    {counts[filter]}
                  </span>
                </button>
              ))}
            </div>
            <TimelineBar />
          </div>

          <AnimatePresence mode="wait" initial={false} custom={side}>
            <Rows
              key={_tag}
              filter={_tag}
              items={items}
              past={past}
              side={side}
              arrival={first.current ? 'first' : 'tab'}
              onClear={() => send({ _tag: 'ClearedCompleted' })}
            />
          </AnimatePresence>
        </div>
      </ListContext.Provider>
    </MotionConfig>
  );
});

/** The list leaving as another tab's comes in: a nudge away from that side. */
const LIST = {
  shown: { opacity: 1, x: 0 },
  gone: (side: Side) => ({ opacity: 0, x: -side * TRAVEL * 0.3 }),
};

/**
 * One tab's rows. A new tab is a new list: the old one nudges away from
 * the new tab's side and fades, then this one's rows come in from it, one
 * after another.
 */
function Rows({
  filter,
  items,
  past,
  side,
  arrival,
  onClear,
}: {
  readonly filter: Filter;
  readonly items: ReadonlyArray<Item>;
  readonly past: boolean;
  /** The side this tab's rows come in from. */
  readonly side: Side;
  readonly onClear: () => void;
  /** How the rows here at first come in; any later are added or moved. */
  readonly arrival: Arrival;
}) {
  const transition = useTransition();
  const shown = items.filter((item) => item.done === (filter === 'Completed'));
  const mounted = useRef(false);
  // Whether each to-do was done when last drawn: one that comes into this
  // tab having been in the other moved here, by time travel.
  const known = useRef(new Map<string, boolean>());
  useEffect(() => {
    mounted.current = true;
    known.current = new Map(items.map((item) => [item.id, item.done]));
  });
  const comes = (item: Item): { arrival: Arrival; side: Side } => {
    if (!mounted.current) return { arrival, side };
    const was = known.current.get(item.id);
    // Into Completed from the left, into Active from the right.
    if (was !== undefined && was !== item.done)
      return { arrival: 'moved', side: item.done ? -1 : 1 };
    return { arrival: 'added', side };
  };
  const empty = EMPTY[filter];
  const gutter = useGutter();
  return (
    <motion.ul
      {...DRAWN}
      layoutScroll
      variants={LIST}
      initial={false}
      animate="shown"
      exit="gone"
      transition={transition({ duration: EXIT_S * 0.7, ease: ENTER })}
      aria-label={`${filter} to-dos`}
      inert={past}
      // Room for the scrollbar is kept on both edges, overflowing or not, and
      // taken out of the padding: the rows never move, and line up with the
      // field and tabs above.
      style={{ '--pad': `calc(3rem - ${gutter}px)` } as CSSProperties}
      className="relative -mx-12 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-(--pad) pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)] [scrollbar-color:var(--pg-control)_transparent] [scrollbar-gutter:stable_both-edges] [scrollbar-width:thin]"
    >
      <AnimatePresence mode="popLayout">
        {shown.map((item, i) => (
          <Row key={item.id} id={item.id} order={i} {...comes(item)} />
        ))}
        {filter === 'Completed' && shown.length > 0 && (
          <motion.li
            {...DRAWN}
            key="clear"
            layout="position"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition({
              default: { duration: ENTER_S, ease: ENTER },
              layout: GLIDE,
            })}
            className="flex justify-center pt-1"
          >
            <button
              type="button"
              onClick={onClear}
              className="h-10 cursor-pointer rounded-xl px-4 text-sm text-(--pg-text-3) transition-colors duration-150 hover:bg-(--pg-raised) hover:text-(--pg-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus)"
            >
              Clear completed
            </button>
          </motion.li>
        )}
        {shown.length === 0 && (
          // Laid over the top of the list, where the last row was: it
          // fades in as that row leaves, and nothing moves.
          <motion.li
            {...DRAWN}
            key="empty"
            initial={{ opacity: 0, scale: 0.97, filter: 'blur(2px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.97, filter: 'blur(0px)' }}
            transition={transition({
              duration: ENTER_S,
              ease: ENTER,
              delay: mounted.current ? 0.06 : 0.1,
            })}
            className="absolute inset-x-(--pad) top-0 rounded-2xl bg-(--pg-sunken) px-6 py-10 text-center"
          >
            <p className="text-sm font-medium text-(--pg-text-2)">
              {empty.title}
            </p>
            <p className="mt-1 text-sm text-(--pg-text-3)">{empty.hint}</p>
          </motion.li>
        )}
      </AnimatePresence>
    </motion.ul>
  );
}

/**
 * How wide a thin scrollbar is in this browser: 0 where scrollbars float
 * over the content, as on macOS.
 */
const useGutter = () => {
  const [gutter, setGutter] = useState(0);
  useLayoutEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;width:100px;height:100px;overflow:scroll;scrollbar-width:thin';
    document.body.appendChild(probe);
    setGutter(probe.offsetWidth - probe.clientWidth);
    probe.remove();
  }, []);
  return gutter;
};

/** The to-do list and its Actor, as one component: <TodosApp />. */
export const TodosApp = View.app(TodosView, { name: 'playground:todos' });
