import { Context, Effect, Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Runtime, Snapshot } from '@kestack/kabuki';

/*
 * Two small Fakes the tests run, shaped as a real one is and importing
 * nothing of this package.
 *
 * - Weather   one Actor with States: dry or raining, the temperature, and a
 *             storm warning a reload does not keep (`kept`). Serves
 *             `Weather`.
 * - Garage    a root with a keyed Child per car, each parked or not.
 *             Serves `Parking`: the cars parked now.
 */

export class Weather extends Context.Service<
  Weather,
  { readonly now: Effect.Effect<string> }
>()('test/Weather') {}

export class Parking extends Context.Service<
  Parking,
  { readonly parked: Effect.Effect<ReadonlyArray<string>> }
>()('test/Parking') {}

export const WeatherFake = Actor.define('Weather', {
  state: { Dry: {}, Raining: { heavy: Schema.Boolean } },
  model: {
    degrees: Schema.Number,
    untilReload: Schema.Struct({ storm: Schema.Boolean }),
  },
  message: {
    /** Rain starts, light or heavy. */
    StartRaining: { heavy: Schema.Boolean },
    StopRaining: {},
    SetTemperature: { degrees: Schema.Number },
    WarnOfAStorm: {},
    /** Not a Control: the app's own. */
    Observed: {},
  },
}).build({
  init: () => ({
    state: { _tag: 'Dry' },
    model: { degrees: 20, untilReload: { storm: false } },
  }),
  on: {
    SetTemperature: ({ degrees }) => ({ model: { degrees } }),
    WarnOfAStorm: () => ({ model: { untilReload: { storm: true } } }),
    Observed: () => ({}),
  },
  states: {
    Dry: {
      on: {
        StartRaining: ({ heavy }) => ({ state: { _tag: 'Raining', heavy } }),
      },
    },
    Raining: { on: { StopRaining: () => ({ state: { _tag: 'Dry' } }) } },
  },
});

const said = (runtime: Runtime<typeof WeatherFake>) => {
  const { root } = runtime;
  const sky =
    root._tag === 'Raining'
      ? root.state.heavy
        ? 'pouring'
        : 'raining'
      : 'dry';
  return `${sky}, ${root.model.degrees}°${root.model.untilReload.storm ? ', storm coming' : ''}`;
};

export const weather = {
  name: 'Weather',
  actor: WeatherFake,
  controls: [
    'StartRaining',
    'StopRaining',
    'SetTemperature',
    'WarnOfAStorm',
  ] as const,
  serve: (runtime: Runtime<typeof WeatherFake>) =>
    Layer.succeed(Weather, { now: Effect.sync(() => said(runtime)) }),
  kept: (
    snapshot: Snapshot<typeof WeatherFake>,
  ): Snapshot<typeof WeatherFake> => ({
    ...snapshot,
    root: {
      ...snapshot.root,
      model: { ...snapshot.root.model, untilReload: { storm: false } },
    },
  }),
};

const Color = Schema.Literals(['red', 'blue', 'green']);

export const CarFake = Actor.define('Car', {
  input: Schema.Struct({ name: Schema.String, color: Color }),
  model: { name: Schema.String, color: Color, parked: Schema.Boolean },
  message: { Park: {}, DriveAway: {} },
}).build({
  init: ({ name, color }) => ({ model: { name, color, parked: true } }),
  on: {
    Park: () => ({ model: { parked: true } }),
    DriveAway: () => ({ model: { parked: false } }),
  },
});

export const GarageFake = Actor.define('Garage', {
  model: {
    cars: Schema.Array(Schema.Struct({ name: Schema.String, color: Color })),
  },
  message: {
    AddCar: {
      name: Schema.String,
      color: Color,
      seats: Schema.optional(Schema.Int),
    },
  },
}).build({
  init: () => ({ model: { cars: [] } }),
  children: {
    cars: Actor.child(CarFake, {
      each: ({ model }) => model.cars.map(({ name }) => name),
      input: ({ model }, name) =>
        model.cars.find((car) => car.name === name) ?? {
          name,
          color: 'red' as const,
        },
    }),
  },
  on: {
    AddCar: ({ name, color }, { model }) => ({
      model: { cars: [...model.cars, { name, color }] },
    }),
  },
});

export const garage = {
  name: 'Garage',
  actor: GarageFake,
  controls: ['AddCar', 'Park', 'DriveAway'] as const,
  serve: (runtime: Runtime<typeof GarageFake>) =>
    Layer.succeed(Parking, {
      parked: Effect.sync(() =>
        runtime.root.children.cars
          .filter((car) => car.model.parked)
          .map((car) => car.model.name),
      ),
    }),
};
