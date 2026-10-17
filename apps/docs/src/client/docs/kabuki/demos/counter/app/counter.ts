import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

// What the Counter holds, and the Messages it takes.
export const Counter = Actor.define('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({
    Decremented: {},
    Incremented: {},
    Reset: {},
  }),
});

// Where it starts, and what each Message does to the count.
export const CounterLive = Actor.build(Counter, {
  init: () => ({ model: { count: 0 } }),
  on: {
    Decremented: (_, { model }) => ({ model: { count: model.count - 1 } }),
    Incremented: (_, { model }) => ({ model: { count: model.count + 1 } }),
    Reset: () => ({ model: { count: 0 } }),
  },
});
