import { Schema } from 'effect';
import { Actor } from 'effect-oak';

export const Rocket = Actor.make('Rocket', {
  model: Schema.Struct({ fuel: Schema.Number }),
  message: Schema.TaggedUnion({ Fuel: {} }),
}).build({
  init: () => ({ model: { fuel: 0 } }),
  on: {
    Fuel: (_, { model }) => ({
      model: { fuel: Math.min(model.fuel + 20, 100) },
    }),
  },
});
