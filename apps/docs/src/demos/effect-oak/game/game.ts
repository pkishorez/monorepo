import { Effect, Random, Schedule, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';

/*
 * The game, as data: Welcome → Playing ⇄ Paused, then Crashed.
 *
 * The Model says what is happening, in road units and milliseconds of the
 * app's Time: when you set off, which lane you are heading for and since
 * when, and where each oncoming car was when it appeared. Where everything is
 * at any moment follows from that (`laneAt`, `distanceAfter`, `aheadAt`).
 *
 * While Playing, a Lifetime sends oncoming cars. Every Update that changes
 * the road works out when you would hit one if nothing else happened, and
 * asks for a Collided Message at that Time. Steering out of the way replaces
 * that plan; Collided arriving means the plan held, and the game is over.
 *
 * Pausing is the game's own: Paused keeps the road and when it stopped, and
 * drops the crash plan. Resuming moves every Time in the road on by the pause,
 * so the road picks up exactly where it stood, and plans again.
 */

const Config = Schema.Struct({
  lanes: Schema.Number,
  laneWidth: Schema.Number,
  /** How much road is in sight, front to back. */
  roadLength: Schema.Number,
  /** One painted dash of a divider, and the gap after it. */
  dash: Schema.Number,
  gap: Schema.Number,
  car: Schema.Struct({ width: Schema.Number, length: Schema.Number }),
  /** Road units per second when you set off. */
  speed: Schema.Number,
  /** Every `every` milliseconds the road gets `by` times faster, up to `top`. */
  speedUp: Schema.Struct({
    every: Schema.Number,
    by: Schema.Number,
    top: Schema.Number,
  }),
  /** Milliseconds to move one lane over. */
  laneChange: Schema.Number,
  /** No cars for `warmUp` milliseconds, then one every `every`, driving at `speed`. */
  traffic: Schema.Struct({
    warmUp: Schema.Number,
    every: Schema.Number,
    speed: Schema.Number,
  }),
});
export type Config = typeof Config.Type;

const DEFAULTS: Config = {
  lanes: 2,
  laneWidth: 92,
  roadLength: 440,
  dash: 30,
  gap: 30,
  car: { width: 44, length: 76 },
  speed: 240,
  speedUp: { every: 10_000, by: 1.15, top: 560 },
  laneChange: 180,
  traffic: { warmUp: 5_000, every: 1_500, speed: 120 },
};

/** Your car moving from one lane to another, starting at Time `at`. Lanes count from 0, left. */
const Lane = Schema.Struct({
  from: Schema.Number,
  to: Schema.Number,
  at: Schema.Number,
});
type Lane = typeof Lane.Type;

/** An oncoming car: in `lane`, `ahead` road units in front of yours when it appeared at Time `at`. */
const Oncoming = Schema.Struct({
  id: Schema.Number,
  lane: Schema.Number,
  at: Schema.Number,
  ahead: Schema.Number,
});
type Oncoming = typeof Oncoming.Type;

/** What the road looks like while you drive, and after you crash. */
const Road = {
  startedAt: Schema.Number,
  lane: Lane,
  cars: Schema.Array(Oncoming),
};
export type Road = {
  readonly startedAt: number;
  readonly lane: Lane;
  readonly cars: ReadonlyArray<Oncoming>;
};

// Where things are, at any Time ---------------------------------------------

/** Where your car is at Time `at`, in lanes: 0.5 is halfway between the first two. */
export const laneAt = (lane: Lane, config: Config, at: number): number => {
  const done = Math.min(1, Math.max(0, (at - lane.at) / config.laneChange));
  return lane.from + (lane.to - lane.from) * done;
};

const speedAfter = (config: Config, driving: number) =>
  Math.min(
    config.speedUp.top,
    config.speed *
      config.speedUp.by ** Math.floor(driving / config.speedUp.every),
  );

/** How far you have driven after `driving` milliseconds, in road units. */
export const distanceAfter = (config: Config, driving: number) => {
  let distance = 0;
  for (let from = 0; from < driving; from += config.speedUp.every) {
    const until = Math.min(driving, from + config.speedUp.every);
    distance += (speedAfter(config, from) * (until - from)) / 1000;
  }
  return distance;
};

/** How far an oncoming car is in front of yours at Time `at`; negative once it has passed. */
export const aheadAt = (
  config: Config,
  { startedAt }: Road,
  car: Oncoming,
  at: number,
) =>
  car.ahead -
  (distanceAfter(config, at - startedAt) -
    distanceAfter(config, car.at - startedAt)) -
  (config.traffic.speed * (at - car.at)) / 1000;

const hits = (config: Config, road: Road, car: Oncoming, at: number) =>
  Math.abs(aheadAt(config, road, car, at)) < config.car.length &&
  Math.abs(laneAt(road.lane, config, at) - car.lane) * config.laneWidth <
    config.car.width;

/** Precision of a planned crash, in milliseconds. */
const STEP = 5;

/** When you would hit an oncoming car if nothing else happened, or null. */
const crashAt = (config: Config, road: Road, from: number): number | null => {
  const coming = (at: number) =>
    road.cars.some(
      (car) => aheadAt(config, road, car, at) > -config.car.length,
    );
  for (let at = from; coming(at); at += STEP) {
    if (road.cars.some((car) => hits(config, road, car, at))) return at;
  }
  return null;
};

// The Node ----------------------------------------------------------------------

/** The road with every Time in it moved on by `by` milliseconds. */
const later = <R extends Road>(road: R, by: number): R => ({
  ...road,
  startedAt: road.startedAt + by,
  lane: { ...road.lane, at: road.lane.at + by },
  cars: road.cars.map((car) => ({ ...car, at: car.at + by })),
});

/** The road changed at Time `at`: forget cars long gone, and plan the crash, if any. */
const drive = (
  config: Config,
  road: Road & { readonly spawned: number },
  at: number,
) => {
  const cars = road.cars.filter(
    (car) => aheadAt(config, road, car, at) > -config.roadLength,
  );
  const next = { ...road, cars };
  const crash = crashAt(config, next, at);
  return {
    state: { _tag: 'Playing' as const, ...next, crashAt: crash },
    commands:
      crash === null
        ? []
        : [
            Effect.sleep(crash - at).pipe(
              Effect.as({ _tag: 'Collided' as const }),
            ),
          ],
    replaceCommands: true,
  };
};

export const Game = Node.make('Game', {
  model: Schema.Struct({ config: Config }),
  state: Schema.TaggedUnion({
    Welcome: {},
    Playing: {
      ...Road,
      /** How many cars have appeared, so each gets its own id. */
      spawned: Schema.Number,
      /** When you will crash unless something changes. */
      crashAt: Schema.NullOr(Schema.Number),
    },
    Paused: { ...Road, spawned: Schema.Number, pausedAt: Schema.Number },
    Crashed: { ...Road, crashedAt: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    Started: {},
    Steered: { toward: Schema.Literals(['left', 'right']) },
    CarSpawned: { lane: Schema.Number },
    Collided: {},
    PressedPause: {},
  }),
}).build({
  init: () => ({ model: { config: DEFAULTS }, state: { _tag: 'Welcome' } }),
  lifetime: {
    // Back from a pause, the next car comes after the usual gap, not the warm-up.
    Playing: ({ model: { config }, state }) =>
      Stream.fromEffectDrain(
        Effect.sleep(
          state.spawned === 0 ? config.traffic.warmUp : config.traffic.every,
        ),
      ).pipe(
        Stream.concat(
          Stream.fromEffectSchedule(
            Random.nextIntBetween(0, config.lanes, { halfOpen: true }),
            Schedule.spaced(config.traffic.every),
          ),
        ),
        Stream.map((lane) => ({ _tag: 'CarSpawned' as const, lane })),
      ),
  },
  update: {
    Welcome: {
      Started: (_, { at }) => ({
        state: {
          _tag: 'Playing',
          startedAt: at,
          lane: { from: 0, to: 0, at },
          cars: [],
          spawned: 0,
          crashAt: null,
        },
      }),
    },
    Playing: {
      Steered: ({ toward }, { model: { config }, state, at }) => {
        const to = Math.min(
          config.lanes - 1,
          Math.max(0, state.lane.to + (toward === 'left' ? -1 : 1)),
        );
        if (to === state.lane.to) return {};
        const from = laneAt(state.lane, config, at);
        return drive(config, { ...state, lane: { from, to, at } }, at);
      },
      CarSpawned: ({ lane }, { model: { config }, state, at }) =>
        drive(
          config,
          {
            ...state,
            spawned: state.spawned + 1,
            cars: [
              ...state.cars,
              {
                id: state.spawned,
                lane,
                at,
                ahead: config.roadLength + config.car.length,
              },
            ],
          },
          at,
        ),
      PressedPause: (_, { state, at }) => ({
        state: {
          _tag: 'Paused',
          startedAt: state.startedAt,
          lane: state.lane,
          cars: state.cars,
          spawned: state.spawned,
          pausedAt: at,
        },
        commands: [],
        replaceCommands: true,
      }),
      Collided: (_, { state, at }) => ({
        state: {
          _tag: 'Crashed',
          startedAt: state.startedAt,
          lane: state.lane,
          cars: state.cars,
          crashedAt: state.crashAt ?? at,
        },
      }),
    },
    Paused: {
      PressedPause: (_, { model: { config }, state, at }) =>
        drive(
          config,
          later(
            {
              startedAt: state.startedAt,
              lane: state.lane,
              cars: state.cars,
              spawned: state.spawned,
            },
            at - state.pausedAt,
          ),
          at,
        ),
    },
  },
});
