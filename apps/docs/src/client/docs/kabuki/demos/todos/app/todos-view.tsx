import { useState } from 'react';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { Checkbox } from '@kestack/web-platform/components/checkbox';
import { Input } from '@kestack/web-platform/components/input';
import { PlusIcon, Trash2Icon } from '@kestack/web-platform/components/lucide';
import { TodoView } from './todo-view.tsx';
import { FILTERS, TodosLive } from './todos.ts';

const EMPTY = {
  All: 'Nothing to do. Add a to-do above.',
  Active: 'All done. Nice.',
  Done: 'Nothing done yet.',
};

// Draws the list: a field to add a to-do, the filter, and a row per to-do
// it shows. The text you type stays here until you press Add.
export const TodosView = View.make(
  TodosLive,
  ({ _tag, model, children, send, root }) => {
    const [text, setText] = useState('');
    const done = new Set(
      model.items.filter((item) => item.done).map((item) => item.id),
    );
    const shown = children.todos.filter(
      (todo) => _tag === 'All' || done.has(todo.key) === (_tag === 'Done'),
    );
    return (
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
                className="rounded-md px-3 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-background aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-xs"
              >
                {filter}
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
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background">
          {shown.map((todo) => (
            <li key={todo.key} className="flex h-11 items-center pr-1">
              <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                <Checkbox
                  aria-label="Done"
                  checked={done.has(todo.key)}
                  onCheckedChange={() =>
                    send({ _tag: 'Toggled', id: todo.key })
                  }
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
            </li>
          ))}
          {shown.length === 0 && (
            <li className="grid h-full place-items-center px-4 text-center text-sm text-muted-foreground">
              {EMPTY[_tag]}
            </li>
          )}
        </ul>
      </div>
    );
  },
);
