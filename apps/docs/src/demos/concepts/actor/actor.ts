import { Schema } from 'effect';
import { Actor } from 'effect-oak';

/**
 * One Actor: a Model, the Messages it accepts, and the Update that turns one
 * into the next Model. Nothing else changes `count`.
 */
export const Counter = Actor.make('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ Increment: {}, Decrement: {}, Reset: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  on: {
    Increment: (_, { model }) => ({ model: { count: model.count + 1 } }),
    Decrement: (_, { model }) => ({ model: { count: model.count - 1 } }),
    Reset: () => ({ model: { count: 0 } }),
  },
});
