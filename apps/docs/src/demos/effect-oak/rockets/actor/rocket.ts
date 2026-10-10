import { Schema } from 'effect';
import { Actor } from 'effect-oak';

/** A rocket on its pad, with fuel you can add and drain. One Actor, no States. */
export const Rocket = Actor.make('Rocket', {
  model: Schema.Struct({ fuel: Schema.Number }),
  message: Schema.TaggedUnion({
    Fuel: {},
    Drain: {},
  }),
}).build({
  init: () => ({ model: { fuel: 0 } }),
  update: {
    Fuel: (_, { model }) => ({
      model: { fuel: Math.min(model.fuel + 10, 100) },
    }),
    Drain: (_, { model }) => ({
      model: { fuel: Math.max(model.fuel - 10, 0) },
    }),
  },
});
