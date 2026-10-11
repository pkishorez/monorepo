import { Effect, Schema } from 'effect';
import { Actor, Command } from 'effect-oak';
import { Hangar } from './hangar.js';
import { Weather } from './weather.js';

const Message = Schema.TaggedUnion({
  Fuel: {},
  Launch: {},
  Cleared: {},
  Scrubbed: {},
  BoostersSpent: {},
  Steadied: {},
  Burned: {},
  Land: {},
  TouchedDown: {},
  Return: {},
  Docked: {},
  Rebuild: {},
  Dismantle: {},
});

const checkTheSky = Command.make('checkTheSky', {
  run: () =>
    Effect.gen(function* () {
      const sky = yield* (yield* Weather).sky;
      return sky === 'storm'
        ? ({ _tag: 'Scrubbed' } as const)
        : ({ _tag: 'Cleared' } as const);
    }),
});

const dismantle = Command.make('dismantle', {
  args: Schema.Struct({ name: Schema.String }),
  run: ({ name }) =>
    Effect.gen(function* () {
      const hangar = yield* Hangar;
      yield* hangar.dismantle(name);
    }),
});

export const Rocket = Actor.make('Rocket', {
  requires: [Weather, Hangar],
  input: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({
    name: Schema.String,
    fuel: Schema.Number,
    scrubbedAt: Schema.NullOr(Schema.Number),
  }),
  state: Schema.TaggedUnion({
    OnPad: {},
    Ascending: {},
    Separating: {},
    Cruising: {},
    Descending: { safe: Schema.Boolean },
    Landed: {},
    Returning: {},
    Crashed: {},
    Lost: {},
  }),
  message: Message,
}).build({
  init: ({ name }) => ({
    model: { name, fuel: 0, scrubbedAt: null },
    state: { _tag: 'OnPad' },
  }),
  state: {
    OnPad: {
      on: {
        Fuel: (_, { model }) => ({
          model: { ...model, fuel: Math.min(model.fuel + 20, 100) },
        }),
        Launch: (_, { model }) =>
          model.fuel > 0 ? { command: checkTheSky() } : {},
        Cleared: () => ({ state: { _tag: 'Ascending' } }),
        Scrubbed: (_, { model, at }) => ({
          model: { ...model, scrubbedAt: at },
        }),
      },
    },
    Ascending: {
      workers: {
        ascend: {
          run: (self) =>
            self
              .send({ _tag: 'BoostersSpent' })
              .pipe(Effect.delay('1.9 seconds')),
        },
      },
      on: { BoostersSpent: () => ({ state: { _tag: 'Separating' } }) },
    },
    Separating: {
      workers: {
        separate: {
          run: (self) =>
            self.send({ _tag: 'Steadied' }).pipe(Effect.delay('1.4 seconds')),
        },
      },
      on: { Steadied: () => ({ state: { _tag: 'Cruising' } }) },
    },
    Cruising: {
      workers: {
        burn: {
          run: (self) =>
            self
              .send({ _tag: 'Burned' })
              .pipe(Effect.delay('700 millis'), Effect.forever),
        },
      },
      on: {
        Burned: (_, { model }) =>
          model.fuel > 5
            ? { model: { ...model, fuel: model.fuel - 5 } }
            : { model: { ...model, fuel: 0 }, state: { _tag: 'Lost' } },
        Land: (_, { model }) => ({
          state: { _tag: 'Descending', safe: model.fuel >= 30 },
        }),
      },
    },
    Descending: {
      workers: {
        descend: {
          run: (self) =>
            self
              .send({ _tag: 'TouchedDown' })
              .pipe(Effect.delay('3.4 seconds')),
        },
      },
      on: {
        TouchedDown: (_, { state }) => ({
          state: { _tag: state.safe ? 'Landed' : 'Crashed' },
        }),
      },
    },
    Landed: {
      on: {
        Return: () => ({ state: { _tag: 'Returning' } }),
        Dismantle: (_, { model }) => ({
          command: dismantle({ name: model.name }),
        }),
      },
    },
    Returning: {
      workers: {
        dock: {
          run: (self) =>
            self.send({ _tag: 'Docked' }).pipe(Effect.delay('2.4 seconds')),
        },
      },
      on: {
        Docked: (_, { model }) => ({
          model: { ...model, fuel: 0 },
          state: { _tag: 'OnPad' },
        }),
      },
    },
    Crashed: {
      on: {
        Rebuild: (_, { model }) => ({
          model: { ...model, fuel: 0 },
          state: { _tag: 'OnPad' },
        }),
        Dismantle: (_, { model }) => ({
          command: dismantle({ name: model.name }),
        }),
      },
    },
    Lost: {
      on: {
        Rebuild: (_, { model }) => ({
          model: { ...model, fuel: 0 },
          state: { _tag: 'OnPad' },
        }),
      },
    },
  },
});
