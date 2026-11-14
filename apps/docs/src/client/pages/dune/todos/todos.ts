import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

/*
 * The to-do list as one Kabuki Actor. Its State is the tab on show,
 * Active or Completed; its Model is every to-do, done or not. Each change
 * is a Message, kept in the app's History, so the whole list can be shown
 * as it was after any one of them: the view draws whichever it is handed,
 * and the to-dos that differ leave or arrive on the way.
 */

export const FILTERS = ['Active', 'Completed'] as const;
export type Filter = (typeof FILTERS)[number];

export type Item = {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
};

export const Todos = Actor.define('Todos', {
  state: Schema.TaggedUnion({ Active: {}, Completed: {} }),
  model: Schema.Struct({
    items: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        text: Schema.String,
        done: Schema.Boolean,
      }),
    ),
    /** How many to-dos were ever added: the next one's id. */
    next: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    Added: { text: Schema.String },
    Toggled: { id: Schema.String },
    Removed: { id: Schema.String },
    ClearedCompleted: {},
    Filtered: { to: Schema.Literals(FILTERS) },
  }),
});

export const SEED: ReadonlyArray<Omit<Item, 'id'>> = [
  { text: 'Book the flights to Lisbon', done: false },
  { text: 'Send Sam the photos from the trip', done: false },
  { text: 'Water the plants', done: false },
  { text: 'Renew the passport', done: true },
  { text: 'Pick a restaurant for Friday', done: true },
];

export const TodosLive = Todos.build({
  init: () => ({
    state: { _tag: 'Active' },
    model: {
      items: SEED.map((item, i) => ({ id: `${i}`, ...item })),
      next: SEED.length,
    },
  }),
  on: {
    // Newest first: it forms right under the field it was typed in.
    Added: ({ text }, { model }) => ({
      model: {
        items: [{ id: `${model.next}`, text, done: false }, ...model.items],
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
    ClearedCompleted: (_, { model }) => ({
      model: { ...model, items: model.items.filter((item) => !item.done) },
    }),
    Filtered: ({ to }) => ({ state: { _tag: to } }),
  },
});
