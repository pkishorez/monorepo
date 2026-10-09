import { Effect, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';
import { Checkbox } from '@kstackz/web-platform/components/checkbox';
import { Skeleton } from '@kstackz/web-platform/components/skeleton';
import { Todo, TodoApi } from '../../../services/index.js';

/** Loads once on the way in, then every change goes through the TodoApi. */
export const Todos = Node.make('Todos', {
  requires: { api: TodoApi },
  model: Schema.Struct({ draft: Schema.String }),
  state: Schema.TaggedUnion({
    Loading: {},
    Ready: { items: Schema.Array(Todo) },
  }),
  message: Schema.TaggedUnion({
    Loaded: { items: Schema.Array(Todo) },
    ChangedDraft: { draft: Schema.String },
    Added: {},
    Created: { todo: Todo },
    Toggled: { id: Schema.String },
  }),
}).build({
  init: () => ({ model: { draft: '' }, state: { _tag: 'Loading' } }),
  lifetime: {
    Loading: () =>
      Stream.fromEffect(
        Effect.gen(function* () {
          return yield* (yield* TodoApi).list;
        }),
      ).pipe(Stream.map((items) => ({ _tag: 'Loaded' as const, items }))),
  },
  update: {
    Loading: {
      Loaded: ({ items }) => ({ state: { _tag: 'Ready', items } }),
    },
    Ready: {
      Added: (_, { model }) =>
        model.draft.trim() === ''
          ? {}
          : {
              model: { draft: '' },
              commands: [
                Effect.gen(function* () {
                  const todo = yield* (yield* TodoApi).add(model.draft.trim());
                  return { _tag: 'Created' as const, todo };
                }),
              ],
            },
      Created: ({ todo }, { state }) => ({
        state: { ...state, items: [...state.items, todo] },
      }),
      Toggled: ({ id }, { state }) => ({
        state: {
          ...state,
          items: state.items.map((todo) =>
            todo.id === id ? { ...todo, done: !todo.done } : todo,
          ),
        },
        commands: [
          Effect.gen(function* () {
            yield* (yield* TodoApi).toggle(id);
          }),
        ],
      }),
    },
    '*': {
      ChangedDraft: ({ draft }) => ({ model: { draft } }),
    },
  },
});

const TodoSkeleton = () => (
  <ul className="flex flex-col gap-3" aria-label="Loading todos">
    {[60, 75, 45].map((width) => (
      <li key={width} className="flex items-center gap-3">
        <Skeleton className="size-4 rounded-[4px]" />
        <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
      </li>
    ))}
  </ul>
);

export const TodosView = View.make(Todos, {
  Loading: () => <TodoSkeleton />,
  Ready: ({ model, state, send }) => {
    const left = state.items.filter((todo) => !todo.done).length;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Todos</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {left} left
          </span>
        </div>
        {state.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to do yet. Add your first todo below.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {state.items.map((todo) => (
              <li key={todo.id}>
                <label className="-mx-2 flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted/60">
                  <Checkbox
                    checked={todo.done}
                    onCheckedChange={() =>
                      send({ _tag: 'Toggled', id: todo.id })
                    }
                  />
                  <span
                    className={
                      todo.done ? 'text-muted-foreground line-through' : ''
                    }
                  >
                    {todo.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send({ _tag: 'Added' });
          }}
        >
          <Input
            aria-label="New todo"
            placeholder="What needs doing?"
            value={model.draft}
            onChange={(event) =>
              send({ _tag: 'ChangedDraft', draft: event.target.value })
            }
          />
          <Button type="submit" variant="outline">
            Add todo
          </Button>
        </form>
      </div>
    );
  },
});
