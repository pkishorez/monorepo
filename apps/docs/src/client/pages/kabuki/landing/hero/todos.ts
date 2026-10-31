import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

/*
 * The hero's app: a to-do list. The list is an Actor whose State is the
 * filter it shows, and each to-do is an Actor of its own, Active or Done.
 * Until the visitor presses Add, the list adds three to-dos by itself, a
 * moment apart, so there is something to play with.
 */

/** The to-dos Add picks from, in an order that looks random. */
const TEXTS = [
  'Water the plants',
  'Call grandma',
  'Buy oat milk',
  'Fix the bike light',
  'Book a haircut',
  'Read one chapter',
  'Plan the weekend',
  'Back up the photos',
];

/** How many to-dos the list keeps; older ones leave. */
export const ROWS = 4;

/** How many to-dos the list adds by itself. */
export const AUTO = 3;

export const FILTERS = ['Active', 'Done', 'All'] as const;
export type Filter = (typeof FILTERS)[number];

export const Todo = Actor.define('Todo', {
  input: Schema.Struct({ text: Schema.String }),
  props: Schema.Struct({ filter: Schema.Literals(FILTERS) }),
  state: Schema.TaggedUnion({ Active: {}, Done: {} }),
  model: Schema.Struct({ text: Schema.String }),
  message: Schema.TaggedUnion({ Toggled: {} }),
});

export const TodoLive = Todo.build({
  init: ({ text }) => ({ state: { _tag: 'Active' }, model: { text } }),
  states: {
    Active: { on: { Toggled: () => ({ state: { _tag: 'Done' } }) } },
    Done: { on: { Toggled: () => ({ state: { _tag: 'Active' } }) } },
  },
});

export const Todos = Actor.define('Todos', {
  state: Schema.TaggedUnion({ All: {}, Active: {}, Done: {} }),
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    /** How many to-dos were ever added: the next one's id. */
    count: Schema.Number,
    /** The visitor has not pressed Add yet. */
    auto: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    Added: {},
    Pressed: {},
    Filtered: { to: Schema.Literals(FILTERS) },
  }),
});

/** The list with one more to-do, keeping the last `ROWS`. */
const added = (model: { ids: ReadonlyArray<string>; count: number }) => ({
  ids: [...model.ids, `${model.count}`].slice(-ROWS),
  count: model.count + 1,
});

export const TodosLive = Todos.build({
  init: () => ({
    state: { _tag: 'Active' },
    model: { ids: [], count: 0, auto: true },
  }),
  children: {
    todos: Actor.child(TodoLive, {
      each: ({ model }) => model.ids,
      input: (_, id) => ({ text: TEXTS[Number(id) % TEXTS.length]! }),
      props: ({ state }) => ({ filter: state._tag }),
    }),
  },
  workers: {
    // Adds the next to-do a moment later, until the visitor takes over.
    demo: {
      while: ({ model }) => model.auto && model.count < AUTO,
      run: (self) =>
        Effect.forever(
          Effect.sleep(900).pipe(Effect.andThen(self.send({ _tag: 'Added' }))),
        ),
    },
  },
  on: {
    Added: (_, { model }) => ({ model: { ...model, ...added(model) } }),
    Pressed: (_, { model }) => ({ model: { auto: false, ...added(model) } }),
    Filtered: ({ to }) => ({ state: { _tag: to } }),
  },
});
