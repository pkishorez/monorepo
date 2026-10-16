import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

// 1. Define: what the Counter holds, and the Messages it takes.
export const Counter = Actor.define('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({
    Added: { amount: Schema.Number },
    Reset: {},
  }),
});

// 2. Build: where it starts, and what each Message does.
export const CounterLive = Actor.build(Counter, {
  init: () => ({ model: { count: 0 } }),
  on: {
    Added: ({ amount }, { model }) => ({
      model: { count: model.count + amount },
    }),
    Reset: () => ({ model: { count: 0 } }),
  },
});
