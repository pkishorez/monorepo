import { Schema } from 'effect';
import { Actor } from 'effect-oak';

/** A number you can step up, step down and reset. One Actor, one State. */
export const Counter = Actor.make('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({
    ClickedDecrement: {},
    ClickedIncrement: {},
    ClickedReset: {},
  }),
}).build({
  init: () => ({ model: { count: 0 } }),
  update: {
    ClickedDecrement: (_, { model }) => ({
      model: { count: model.count - 1 },
    }),
    ClickedIncrement: (_, { model }) => ({
      model: { count: model.count + 1 },
    }),
    ClickedReset: () => ({ model: { count: 0 } }),
  },
});
