import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Booster } from '../more-actors/index.js';
import { Weather } from './weather.js';

/** Launching Requires Weather: a Command checks the sky first. */
export const Rocket = Actor.make('Rocket', {
  requires: { weather: Weather },
  model: Schema.Struct({ fuel: Schema.Number, scrubbed: Schema.Boolean }),
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
    Cleared: {},
    Scrubbed: {},
    Burned: {},
    Land: {},
    Reset: {},
  }),
  children: { InFlight: { boosters: Actor.many(Booster) } },
}).build({
  init: () => ({
    model: { fuel: 0, scrubbed: false },
    state: { _tag: 'OnPad' },
  }),
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
        model: { ...model, fuel: Math.min(model.fuel + 10, 100) },
      }),
      Drain: (_, { model }) => ({
        model: { ...model, fuel: Math.max(model.fuel - 10, 0) },
      }),
      Launch: (_, { model }) =>
        model.fuel > 0
          ? {
              command: Effect.gen(function* () {
                const sky = yield* (yield* Weather).sky;
                return sky === 'storm'
                  ? ({ _tag: 'Scrubbed' } as const)
                  : ({ _tag: 'Cleared' } as const);
              }),
            }
          : {},
      Cleared: (_, { model }) => ({
        model: { ...model, scrubbed: false },
        state: { _tag: 'InFlight' },
      }),
      Scrubbed: (_, { model }) => ({ model: { ...model, scrubbed: true } }),
    },
    InFlight: {
      Burned: (_, { model }) =>
        model.fuel > 10
          ? { model: { ...model, fuel: model.fuel - 10 } }
          : { model: { ...model, fuel: 0 }, state: { _tag: 'Lost' } },
      Land: () => ({ state: { _tag: 'Landed' } }),
    },
    Landed: { Reset: () => ({ state: { _tag: 'OnPad' } }) },
    Lost: { Reset: () => ({ state: { _tag: 'OnPad' } }) },
  },
});
