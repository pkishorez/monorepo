import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Booster } from './booster.js';

/** The rocket from States, now with two Booster Children while InFlight. */
export const Rocket = Actor.make('Rocket', {
  model: Schema.Struct({ fuel: Schema.Number }),
  state: Schema.TaggedUnion({
    OnPad: {},
    InFlight: {},
    Landed: {},
    Lost: {},
  }),
  message: Schema.TaggedUnion({
    Fuel: {},
    Drain: {},
    Launch: {},
    Burned: {},
    Land: {},
    Reset: {},
  }),
  children: { InFlight: { boosters: Actor.many(Booster) } },
}).build({
  init: () => ({ model: { fuel: 0 }, state: { _tag: 'OnPad' } }),
  invoke: {
    InFlight: () => ({ boosters: [{ key: 'left' }, { key: 'right' }] }),
  },
  lifetime: {
    InFlight: (self) =>
      self
        .send({ _tag: 'Burned' })
        .pipe(Effect.delay('400 millis'), Effect.forever),
  },
  update: {
    OnPad: {
      Fuel: (_, { model }) => ({
        model: { fuel: Math.min(model.fuel + 10, 100) },
      }),
      Drain: (_, { model }) => ({
        model: { fuel: Math.max(model.fuel - 10, 0) },
      }),
      Launch: (_, { model }) =>
        model.fuel > 0 ? { state: { _tag: 'InFlight' } } : {},
    },
    InFlight: {
      Burned: (_, { model }) =>
        model.fuel > 10
          ? { model: { fuel: model.fuel - 10 } }
          : { model: { fuel: 0 }, state: { _tag: 'Lost' } },
      Land: () => ({ state: { _tag: 'Landed' } }),
    },
    Landed: { Reset: () => ({ state: { _tag: 'OnPad' } }) },
    Lost: { Reset: () => ({ state: { _tag: 'OnPad' } }) },
  },
});
