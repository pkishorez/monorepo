import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

export const Counter = Actor.define('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({
    Incremented: {},
    Decremented: {},
    Reset: {},
  }),
});

export const CounterLive = Counter.build({
  init: () => ({ model: { count: 0 } }),
  on: {
    Incremented: (_, { model }) => ({ model: { count: model.count + 1 } }),
    Decremented: (_, { model }) => ({ model: { count: model.count - 1 } }),
    Reset: () => ({ model: { count: 0 } }),
  },
});
