import { useId, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { TodoView } from './todo-view.tsx';
import { FILTERS, TodosLive } from './todos.ts';

const EMPTY = {
  All: 'Nothing to do. Add a to-do above.',
  Active: 'All done. Nice.',
  Done: 'Nothing done yet.',
};

/** Arriving: fast out of the gate, settling in. */
const ENTER = { duration: 0.25, ease: [0.23, 1, 0.32, 1] } as const;
/** Leaving: quicker than arriving. */
const EXIT = { duration: 0.18, ease: [0.4, 0, 1, 1] } as const;
/** Going from one place to another. */
const MOVE = { duration: 0.3, ease: [0.77, 0, 0.175, 1] } as const;
/** A row's height: the rows under it close up or make room as it comes and goes. */
const ROW = 44;

// Draws the list: a field to add a to-do, the filter, and a row per to-do
// it shows. The text you type stays here until you press Add. Rows open
// and close as to-dos come and go, whether you added them or the Timeline
// brought them back, and the filter's mark slides to the one picked.
export const TodosView = View.make(
  TodosLive,
  ({ _tag, model, children, send, root }) => {
    const [text, setText] = useState('');
    const mark = useId();
    const done = new Set(
      model.items.filter((item) => item.done).map((item) => item.id),
    );
    const shown = children.todos.filter(
      (todo) => _tag === 'All' || done.has(todo.key) === (_tag === 'Done'),
    );
    return (
      <MotionConfig reducedMotion="user">
        <div {...root} className="flex h-full w-full max-w-md flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send({ _tag: 'Added', text: text.trim() });
              setText('');
            }}
          >
            <Input
              aria-label="New to-do"
              placeholder="Add a to-do"
              autoComplete="off"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="h-10"
            />
            <Button type="submit" size="lg" disabled={!text.trim()}>
              <PlusIcon />
              Add
            </Button>
          </form>
          <div className="flex items-center justify-between gap-2">
            <div className="flex h-10 rounded-lg bg-muted p-0.5">
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={_tag === filter}
                  onClick={() => send({ _tag: 'Filtered', to: filter })}
                  className="relative rounded-md px-3 text-sm text-muted-foreground transition-colors duration-200 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:font-medium aria-pressed:text-foreground"
                >
                  {_tag === filter && (
                    <motion.span
                      layoutId={mark}
                      transition={MOVE}
                      className="absolute inset-0 rounded-md bg-background shadow-xs"
                    />
                  )}
                  <span className="relative">{filter}</span>
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="lg"
              disabled={done.size === 0}
              onClick={() => send({ _tag: 'ClearedDone' })}
            >
              Clear done
            </Button>
          </div>
          <ul className="relative min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background">
            <AnimatePresence initial={false}>
              {shown.map((todo) => (
                <motion.li
                  key={todo.key}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: ROW, opacity: 1, transition: ENTER }}
                  exit={{ height: 0, opacity: 0, transition: EXIT }}
                  className="overflow-hidden border-border not-first:border-t"
                >
                  <div className="flex h-11 items-center pr-1">
                    <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                      <Check
                        checked={done.has(todo.key)}
                        onChange={() => send({ _tag: 'Toggled', id: todo.key })}
                      />
                    </label>
                    <TodoView instance={todo} />
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label="Delete"
                      className="text-muted-foreground"
                      onClick={() => send({ _tag: 'Removed', id: todo.key })}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {shown.length === 0 && (
                <motion.li
                  key={_tag}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { ...ENTER, delay: 0.1 } }}
                  exit={{ opacity: 0, transition: EXIT }}
                  className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-sm text-muted-foreground"
                >
                  {EMPTY[_tag]}
                </motion.li>
              )}
            </AnimatePresence>
          </ul>
        </div>
      </MotionConfig>
    );
  },
);

// A checkbox whose tick draws itself in, left to right, as it is checked.
function Check({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label="Done"
      onClick={onChange}
      className="grid size-4 shrink-0 place-items-center rounded-[4px] border border-input text-primary-foreground shadow-xs transition-[background-color,border-color] duration-150 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-primary aria-checked:bg-primary dark:bg-input/30 dark:aria-checked:bg-primary"
    >
      <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
        <motion.path
          d="M20 6 9 17l-5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{
            pathLength: checked ? 1 : 0,
            opacity: checked ? 1 : 0,
            transition: checked
              ? {
                  pathLength: { ...ENTER, delay: 0.04 },
                  opacity: { duration: 0.05 },
                }
              : { pathLength: EXIT, opacity: { duration: 0.1, delay: 0.08 } },
          }}
        />
      </svg>
    </button>
  );
}
