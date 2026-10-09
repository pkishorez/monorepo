import { Clock, Context, Effect, Random, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { Composer, Composing } from './composer/index.js';
import {
  clearCompleted,
  Editing,
  Filter,
  remove,
  rename,
  toggle,
  toggleAll,
  TodoList,
} from './list.js';
import { TodoStore } from './store.js';

/*
 * The todo app: Loading → Ready.
 *
 * Loading reads the saved todos in a Lifetime, so they arrive as a Message
 * and Replay sees them too. Ready Provides Composing to its Composer Child:
 * a new todo comes back as a Request, gets a random id from a Command, and
 * every change to the list is saved by a Command that reports how it went.
 */

const Ready = {
  todos: TodoList,
  filter: Filter,
  editing: Editing,
};
type Ready = {
  readonly _tag: 'Ready';
  readonly todos: TodoList;
  readonly filter: Filter;
  readonly editing: Editing;
};

/** Save the list, and say how it went. */
const save = (todos: TodoList) =>
  Effect.gen(function* () {
    yield* (yield* TodoStore).save(todos);
    return { _tag: 'SucceededSave' as const };
  }).pipe(Effect.orElseSucceed(() => ({ _tag: 'FailedSave' as const })));

/** The list changed: keep it, and save it. */
const changed = (state: Ready, todos: TodoList) => ({
  state: { ...state, todos },
  commands: [save(todos)],
});

const NOT_EDITING = { _tag: 'NotEditing' } as const;

export const Todos = Node.make('Todos', {
  requires: { store: TodoStore },
  state: Schema.TaggedUnion({ Loading: {}, Ready }),
  message: Schema.TaggedUnion({
    Loaded: { todos: TodoList },
    RequestedAdd: { text: Schema.String },
    CompletedGenerateTodo: {
      id: Schema.String,
      text: Schema.String,
      createdAt: Schema.Number,
    },
    ToggledTodo: { id: Schema.String },
    DeletedTodo: { id: Schema.String },
    StartedEditing: { id: Schema.String },
    UpdatedEditingTodo: { text: Schema.String },
    SavedEdit: {},
    CancelledEdit: {},
    ToggledAll: {},
    ClearedCompleted: {},
    SelectedFilter: { filter: Filter },
    SucceededSave: {},
    FailedSave: {},
  }),
  provides: { Ready: [Composing] },
  children: { Ready: { composer: Composer } },
}).build({
  init: () => ({ state: { _tag: 'Loading' } }),
  lifetime: {
    Loading: () =>
      Stream.fromEffect(
        Effect.gen(function* () {
          const todos = yield* (yield* TodoStore).load;
          return { _tag: 'Loaded' as const, todos };
        }),
      ),
  },
  provides: {
    Ready: ({ send }) =>
      Context.make(Composing, {
        add: (text) => send({ _tag: 'RequestedAdd', text }),
      }),
  },
  update: {
    Loading: {
      Loaded: ({ todos }) => ({
        state: { _tag: 'Ready', todos, filter: 'All', editing: NOT_EDITING },
      }),
    },
    Ready: {
      RequestedAdd: ({ text }) => ({
        commands: [
          Effect.gen(function* () {
            const id = yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER);
            const createdAt = yield* Clock.currentTimeMillis;
            return {
              _tag: 'CompletedGenerateTodo' as const,
              id: id.toString(36),
              text,
              createdAt,
            };
          }),
        ],
      }),
      CompletedGenerateTodo: (todo, { state }) =>
        changed(state, [
          ...state.todos,
          {
            id: todo.id,
            text: todo.text,
            completed: false,
            createdAt: todo.createdAt,
          },
        ]),
      ToggledTodo: ({ id }, { state }) =>
        changed(state, toggle(state.todos, id)),
      DeletedTodo: ({ id }, { state }) =>
        changed(state, remove(state.todos, id)),
      StartedEditing: ({ id }, { state }) => ({
        state: {
          ...state,
          editing: {
            _tag: 'Editing',
            id,
            text: state.todos.find((todo) => todo.id === id)?.text ?? '',
          },
        },
      }),
      UpdatedEditingTodo: ({ text }, { state }) =>
        state.editing._tag === 'Editing'
          ? { state: { ...state, editing: { ...state.editing, text } } }
          : {},
      SavedEdit: (_, { state }) => {
        if (state.editing._tag === 'NotEditing') return {};
        const text = state.editing.text.trim();
        const editing = { ...state, editing: NOT_EDITING };
        if (text === '') return { state: editing };
        return changed(editing, rename(state.todos, state.editing.id, text));
      },
      CancelledEdit: (_, { state }) => ({
        state: { ...state, editing: NOT_EDITING },
      }),
      ToggledAll: (_, { state }) => changed(state, toggleAll(state.todos)),
      ClearedCompleted: (_, { state }) =>
        changed(state, clearCompleted(state.todos)),
      SelectedFilter: ({ filter }, { state }) => ({
        state: { ...state, filter },
      }),
      SucceededSave: () => ({}),
      FailedSave: () => ({}),
    },
  },
});

export { TodoStoreLive } from './store.js';
