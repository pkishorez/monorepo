import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

// One Counter. Its count is its own; its place in the list is a Prop.
export const Counter = Actor.define('Counter', {
  props: Schema.Struct({ place: Schema.Number }),
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({
    Decremented: {},
    Incremented: {},
  }),
});

export const CounterLive = Actor.build(Counter, {
  init: () => ({ model: { count: 0 } }),
  on: {
    Decremented: (_, { model }) => ({ model: { count: model.count - 1 } }),
    Incremented: (_, { model }) => ({ model: { count: model.count + 1 } }),
  },
});
