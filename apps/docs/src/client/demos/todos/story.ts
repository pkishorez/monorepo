import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

/*
 * The to-do list: two Actors. The list keeps what was added and which
 * filter is on, as its State; each to-do is an Actor of its own, Active or
 * Done, that hides itself when the filter says so.
 */

export const FILTERS = ['All', 'Active', 'Done'] as const;
export type Filter = (typeof FILTERS)[number];

export const Todo = Actor.define('Todo', {
  input: Schema.Struct({ text: Schema.String }),
  props: Schema.Struct({ filter: Schema.Literals(FILTERS) }),
  state: Schema.TaggedUnion({ Active: {}, Done: {} }),
  model: Schema.Struct({ text: Schema.String }),
  message: Schema.TaggedUnion({ Toggled: {} }),
});

export const TodoLive = Actor.build(Todo, {
  init: ({ text }) => ({ state: { _tag: 'Active' }, model: { text } }),
  state: {
    Active: { on: { Toggled: () => ({ state: { _tag: 'Done' } }) } },
    Done: { on: { Toggled: () => ({ state: { _tag: 'Active' } }) } },
  },
});

export const Todos = Actor.define('Todos', {
  state: Schema.TaggedUnion({ All: {}, Active: {}, Done: {} }),
  model: Schema.Struct({
    items: Schema.Array(
      Schema.Struct({ id: Schema.String, text: Schema.String }),
    ),
    /** How many to-dos were ever added: the next one's id. */
    next: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    Added: { text: Schema.String },
    Filtered: { to: Schema.Literals(FILTERS) },
  }),
});

export const TodosLive = Actor.build(Todos, {
  init: () => ({ state: { _tag: 'All' }, model: { items: [], next: 0 } }),
  children: {
    todos: {
      actor: TodoLive,
      each: ({ model }) => model.items.map((item) => item.id),
      input: ({ model }, id) => ({
        text: model.items.find((item) => item.id === id)?.text ?? '',
      }),
      props: ({ state }) => ({ filter: state._tag }),
    },
  },
  on: {
    Added: ({ text }, { model }) => ({
      model: {
        items: [...model.items, { id: `${model.next}`, text }],
        next: model.next + 1,
      },
    }),
    Filtered: ({ to }) => ({ state: { _tag: to } }),
  },
});
