import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { CounterLive } from './counter.ts';

// The list keeps only which Counters are in it. Each one is a Child.
export const Counters = Actor.define('Counters', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    /** How many Counters were ever added: the next one's id. */
    next: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    Added: {},
    Removed: { id: Schema.String },
  }),
});

export const CountersLive = Actor.build(Counters, {
  init: () => ({ model: { ids: ['0', '1'], next: 2 } }),
  children: {
    counters: {
      actor: CounterLive,
      // One Counter per id: add an id and one starts, remove it and it stops.
      each: ({ model }) => model.ids,
      // Worked out again after every Update, so the places follow the list.
      props: ({ model }, id) => ({ place: model.ids.indexOf(id) + 1 }),
    },
  },
  on: {
    Added: (_, { model }) => ({
      model: { ids: [...model.ids, `${model.next}`], next: model.next + 1 },
    }),
    Removed: ({ id }, { model }) => ({
      model: { ...model, ids: model.ids.filter((kept) => kept !== id) },
    }),
  },
});
