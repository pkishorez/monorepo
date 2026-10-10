import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import type { Self } from 'effect-oak';
import { Weather } from '../capabilities/index.js';
import { Booster } from '../more-actors/index.js';

const Message = Schema.TaggedUnion({
  Fuel: {},
  Drain: {},
  Launch: {},
  Ticked: { count: Schema.Number },
  Abort: {},
  Cleared: {},
  Scrubbed: {},
  Burned: {},
  Land: {},
  Reset: {},
});

/** 3, 2, 1, then check the sky. Keyed, so the latest countdown wins. */
const countdown = {
  key: 'countdown',
  run: (self: Self<unknown, unknown, typeof Message.Type>) =>
    Effect.gen(function* () {
      for (const count of [2, 1]) {
        yield* Effect.sleep('1 second');
        yield* self.send({ _tag: 'Ticked', count });
      }
      yield* Effect.sleep('1 second');
      const sky = yield* (yield* Weather).sky;
      return sky === 'storm'
        ? ({ _tag: 'Scrubbed' } as const)
        : ({ _tag: 'Cleared' } as const);
    }),
};

/** Launch now counts down first: a keyed Command you can restart or Abort. */
export const Rocket = Actor.make('Rocket', {
  requires: { weather: Weather },
  model: Schema.Struct({ fuel: Schema.Number, scrubbed: Schema.Boolean }),
  state: Schema.TaggedUnion({
    OnPad: {},
    Countdown: { count: Schema.Number },
    InFlight: {},
    Landed: {},
    Lost: {},
  }),
  message: Message,
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
          ? { state: { _tag: 'Countdown', count: 3 }, command: countdown }
          : {},
    },
    Countdown: {
      Launch: () => ({
        state: { _tag: 'Countdown', count: 3 },
        command: countdown,
      }),
      Ticked: ({ count }) => ({ state: { _tag: 'Countdown', count } }),
      Abort: () => ({ state: { _tag: 'OnPad' }, cancel: 'countdown' }),
      Cleared: (_, { model }) => ({
        model: { ...model, scrubbed: false },
        state: { _tag: 'InFlight' },
      }),
      Scrubbed: (_, { model }) => ({
        model: { ...model, scrubbed: true },
        state: { _tag: 'OnPad' },
      }),
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
