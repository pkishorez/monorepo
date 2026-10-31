import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

export const FILTERS = ['All', 'Active', 'Done'] as const;

// One to-do. Its text is its own: it starts from its Input, and only it
// can rename it. Whether it is done is the list's to say, as a Prop.
export const Todo = Actor.define('Todo', {
  input: Schema.Struct({ text: Schema.String }),
  props: Schema.Struct({ done: Schema.Boolean }),
  model: Schema.Struct({ text: Schema.String }),
  message: Schema.TaggedUnion({ Renamed: { text: Schema.String } }),
});

export const TodoLive = Actor.build(Todo, {
  init: ({ text }) => ({ model: { text } }),
  on: {
    Renamed: ({ text }) => ({ model: { text } }),
  },
});

// The list. Its State is the filter. Its Model keeps what it acts on:
// which to-dos there are, and which are done.
export const Todos = Actor.define('Todos', {
  state: Schema.TaggedUnion({ All: {}, Active: {}, Done: {} }),
  model: Schema.Struct({
    items: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        // What the to-do started with: its Input, read once.
        text: Schema.String,
        done: Schema.Boolean,
      }),
    ),
    next: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    Added: { text: Schema.String },
    Toggled: { id: Schema.String },
    Removed: { id: Schema.String },
    ClearedDone: {},
    Filtered: { to: Schema.Literals(FILTERS) },
  }),
});

const SEED = ['Water the plants', 'Reply to Sam', 'Book a dentist visit'];

export const TodosLive = Actor.build(Todos, {
  init: () => ({
    state: { _tag: 'All' },
    model: {
      items: SEED.map((text, i) => ({ id: `${i}`, text, done: i === 0 })),
      next: SEED.length,
    },
  }),
  // One Todo per item. Each one hears whether it is done, as a Prop.
  children: (child) => ({
    todos: child(TodoLive, {
      each: ({ model }) => model.items.map((item) => item.id),
      input: ({ model }, id) => ({
        text: model.items.find((item) => item.id === id)?.text ?? '',
      }),
      props: ({ model }, id) => ({
        done: model.items.some((item) => item.id === id && item.done),
      }),
    }),
  }),
  on: {
    Added: ({ text }, { model }) => ({
      model: {
        items: [...model.items, { id: `${model.next}`, text, done: false }],
        next: model.next + 1,
      },
    }),
    Toggled: ({ id }, { model }) => ({
      model: {
        ...model,
        items: model.items.map((item) =>
          item.id === id ? { ...item, done: !item.done } : item,
        ),
      },
    }),
    Removed: ({ id }, { model }) => ({
      model: { ...model, items: model.items.filter((item) => item.id !== id) },
    }),
    ClearedDone: (_, { model }) => ({
      model: { ...model, items: model.items.filter((item) => !item.done) },
    }),
    Filtered: ({ to }) => ({ state: { _tag: to } }),
  },
});
