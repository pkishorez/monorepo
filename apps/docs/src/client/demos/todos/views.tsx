// A row remembers the filter it was last drawn with, once that draw is on
// screen, to tell a tick from a change of filter.
// eslint-disable-next-line no-restricted-imports
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { View } from '@kestack/kabuki/react';
import {
  CheckIcon,
  PlusIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { FILTERS, TodoLive, TodosLive } from './story.ts';

/*
 * The to-do list, drawn by React: a field to add one, the filter as a
 * segmented control, and a row per to-do that ticks when pressed and folds
 * away when the filter hides it.
 */

const ROW_PX = 52;
/** A row growing in or folding away. */
const FOLD = { duration: 0.35, ease: [0.77, 0, 0.175, 1] } as const;
/** How long a ticked to-do stays in Active before it folds away, in seconds. */
const LINGER = 0.45;
/** An indicator following what is current. */
const SPRING = { type: 'spring', duration: 0.35, bounce: 0 } as const;

/**
 * A row that grows in and folds away as the filter shows or hides it. One
 * that leaves because it changed, not because the filter did, waits long
 * enough for its tick to be seen first.
 */
function Fold({
  shown,
  filter,
  children,
}: {
  readonly shown: boolean;
  readonly filter: string;
  readonly children: ReactNode;
}) {
  const before = useRef(filter);
  useEffect(() => {
    before.current = filter;
  });
  const delay = shown || before.current !== filter ? 0 : LINGER;
  return (
    <motion.li
      aria-hidden={!shown}
      initial={{ height: 0, opacity: 0 }}
      animate={
        shown ? { height: ROW_PX, opacity: 1 } : { height: 0, opacity: 0 }
      }
      transition={{
        height: { ...FOLD, delay },
        opacity: { duration: shown ? 0.3 : 0.2, delay },
      }}
      className="overflow-hidden"
    >
      {children}
    </motion.li>
  );
}

const TodoView = View.make(TodoLive, ({ _tag, model, props, send, root }) => {
  const done = _tag === 'Done';
  return (
    <Fold
      shown={props.filter === 'All' || props.filter === _tag}
      filter={props.filter}
    >
      <button
        {...root}
        type="button"
        onClick={() => send({ _tag: 'Toggled' })}
        aria-pressed={done}
        className="group flex h-[52px] w-full items-center gap-3 border-b border-border/60 px-5 text-left transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
      >
        <span
          className={`grid size-[18px] shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-200 ease-out group-active:scale-[0.9] ${
            done
              ? 'border-foreground bg-foreground text-background'
              : 'border-muted-foreground/50 group-hover:border-foreground'
          }`}
        >
          <CheckIcon
            strokeWidth={3}
            className={`size-2.5 transition-[opacity,transform] duration-200 ease-out ${done ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
          />
        </span>
        <span
          className={`relative min-w-0 truncate text-sm transition-colors duration-300 ${done ? 'text-muted-foreground' : ''}`}
        >
          {model.text}
          <span
            aria-hidden
            className={`absolute inset-x-0 top-1/2 h-px origin-left bg-muted-foreground transition-transform duration-300 ease-out ${done ? 'scale-x-100' : 'scale-x-0'}`}
          />
        </span>
      </button>
    </Fold>
  );
});

export const TodosView = View.make(
  TodosLive,
  ({ _tag, model, children, send, root }) => {
    const [text, setText] = useState('');
    const trimmed = text.trim();
    const count = model.items.length;
    return (
      <MotionConfig reducedMotion="user">
        <div
          {...root}
          className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8"
        >
          <header className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">To-dos</h2>
            <p className="text-sm text-muted-foreground tabular-nums">
              {count === 0
                ? 'None yet'
                : `${count} ${count === 1 ? 'item' : 'items'}`}
            </p>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!trimmed) return;
              send({ _tag: 'Added', text: trimmed });
              setText('');
            }}
            className="flex flex-col gap-2"
          >
            <label
              htmlFor="todos-demo-new"
              className="text-xs font-medium text-muted-foreground"
            >
              New to-do
            </label>
            <div className="flex gap-2">
              <input
                id="todos-demo-new"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Water the plants"
                autoComplete="off"
                className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 sm:text-sm"
              />
              <button
                type="submit"
                disabled={!trimmed}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-[background-color,color,transform] duration-150 outline-offset-2 hover:bg-primary/85 focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.97] disabled:bg-muted disabled:text-muted-foreground"
              >
                <PlusIcon className="size-4" />
                Add to-do
              </button>
            </div>
          </form>
          <section
            aria-label="To-do list"
            className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_-4px_rgb(0_0_0/0.06)]"
          >
            <div className="flex h-12 items-center border-b border-border px-2">
              <div className="flex rounded-lg bg-muted p-0.5">
                {FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => send({ _tag: 'Filtered', to: filter })}
                    aria-pressed={_tag === filter}
                    className={`relative h-7 rounded-md px-3 text-xs font-medium transition-colors duration-150 outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring ${
                      _tag === filter
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {_tag === filter && (
                      <motion.span
                        layoutId="todos-demo-filter"
                        transition={SPRING}
                        className="absolute inset-0 rounded-md bg-background shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                      />
                    )}
                    <span className="relative">{filter}</span>
                  </button>
                ))}
              </div>
            </div>
            <ul>
              {count === 0 && (
                <li className="flex flex-col gap-1 px-5 py-8 text-center">
                  <span className="text-sm font-medium">Nothing to do yet</span>
                  <span className="text-sm text-muted-foreground">
                    Add your first to-do above.
                  </span>
                </li>
              )}
              {children.todos.map((todo) => (
                <TodoView key={todo.key} instance={todo} />
              ))}
            </ul>
          </section>
        </div>
      </MotionConfig>
    );
  },
);
