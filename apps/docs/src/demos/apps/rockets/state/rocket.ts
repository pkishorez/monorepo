import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';

export const Rocket = Actor.make('Rocket', {
  model: Schema.Struct({ fuel: Schema.Number }),
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
  message: Schema.TaggedUnion({
    Fuel: {},
    Launch: {},
    BoostersSpent: {},
    Steadied: {},
    Burned: {},
    Land: {},
    TouchedDown: {},
    Return: {},
    Docked: {},
    Rebuild: {},
  }),
}).build({
  init: () => ({ model: { fuel: 0 }, state: { _tag: 'OnPad' } }),
  workers: {
    systems: {
      run: () =>
        Effect.gen(function* () {
          // when the rocket rolls out
          yield* Effect.logDebug('Rolled out');
          // while it lives: as many fibers as it needs
          yield* Effect.forkScoped(Effect.logDebug('Systems check'));
          // when it is retired
          yield* Effect.addFinalizer(() => Effect.logDebug('Retired'));
        }),
    },
  },
  state: {
    OnPad: {
      on: {
        Fuel: (_, { model }) => ({
          model: { fuel: Math.min(model.fuel + 20, 100) },
        }),
        Launch: (_, { model }) =>
          model.fuel > 0 ? { state: { _tag: 'Ascending' } } : {},
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
            ? { model: { fuel: model.fuel - 5 } }
            : { model: { fuel: 0 }, state: { _tag: 'Lost' } },
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
      on: { Return: () => ({ state: { _tag: 'Returning' } }) },
    },
    Returning: {
      workers: {
        dock: {
          run: (self) =>
            self.send({ _tag: 'Docked' }).pipe(Effect.delay('2.4 seconds')),
        },
      },
      on: {
        Docked: () => ({ model: { fuel: 0 }, state: { _tag: 'OnPad' } }),
      },
    },
    Crashed: {
      on: {
        Rebuild: () => ({ model: { fuel: 0 }, state: { _tag: 'OnPad' } }),
      },
    },
    Lost: {
      on: {
        Rebuild: () => ({ model: { fuel: 0 }, state: { _tag: 'OnPad' } }),
      },
    },
  },
});
