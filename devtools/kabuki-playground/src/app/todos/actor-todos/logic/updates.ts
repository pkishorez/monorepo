import type { DataOf, InitOf } from '@kestack/kabuki/types';
import type { TodosShape } from './shared/index.ts';

type Ready = DataOf<typeof TodosShape, 'Ready'>;

const MANY = 50;

const without = (list: ReadonlyArray<string>, id: string) =>
  list.filter((kept) => kept !== id);

const withAll = (list: ReadonlyArray<string>, ids: ReadonlyArray<string>) => [
  ...list,
  ...ids.filter((id) => !list.includes(id)),
];

export const init: InitOf<typeof TodosShape> = () => ({
  state: { _tag: 'Loading' },
  model: { todos: [], done: [], syncing: [], next: 1 },
});

export const loaded = ({
  todos,
}: {
  readonly todos: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly done: boolean;
  }>;
}) => ({
  state: { _tag: 'Ready' as const },
  model: {
    todos: todos.map(({ id, title }) => ({ id, title })),
    done: todos.filter(({ done }) => done).map(({ id }) => id),
    next: todos.length + 1,
  },
});

export const loadFailed = ({ reason }: { readonly reason: string }) => ({
  state: { _tag: 'Failed' as const, reason },
});

export const retried = () => ({ state: { _tag: 'Loading' as const } });

export const ready = {
  Added: ({ title }: { readonly title: string }, { model }: Ready) =>
    title.trim() === ''
      ? {}
      : {
          model: {
            todos: [
              ...model.todos,
              { id: `todo-${model.next}`, title: title.trim() },
            ],
            next: model.next + 1,
          },
        },
  Filled: (_: unknown, { model }: Ready) => ({
    model: {
      todos: [
        ...model.todos,
        ...Array.from({ length: MANY }, (_, index) => ({
          id: `todo-${model.next + index}`,
          title: `Chore number ${model.next + index}`,
        })),
      ],
      next: model.next + MANY,
    },
  }),
  Cleared: (_: unknown, { model }: Ready) => ({
    model: {
      todos: model.todos.filter(({ id }) => !model.done.includes(id)),
      done: [],
      syncing: model.syncing.filter((id) => !model.done.includes(id)),
    },
  }),
  Toggled: ({ id }: { readonly id: string }, { model }: Ready) => ({
    model: {
      done: model.done.includes(id)
        ? without(model.done, id)
        : [...model.done, id],
      syncing: withAll(model.syncing, [id]),
    },
  }),
  AllToggled: (_: unknown, { model }: Ready) => {
    const ids = model.todos.map(({ id }) => id);
    const done = model.done.length === ids.length ? [] : ids;
    const moved = ids.filter(
      (id) => model.done.includes(id) !== done.includes(id),
    );
    return { model: { done, syncing: withAll(model.syncing, moved) } };
  },
  Synced: (
    { id, done }: { readonly id: string; readonly done: boolean },
    { model }: Ready,
  ) =>
    model.done.includes(id) === done
      ? { model: { syncing: without(model.syncing, id) } }
      : {},
  Deleted: ({ id }: { readonly id: string }, { model }: Ready) => ({
    model: {
      todos: model.todos.filter((todo) => todo.id !== id),
      done: without(model.done, id),
      syncing: without(model.syncing, id),
    },
  }),
};
