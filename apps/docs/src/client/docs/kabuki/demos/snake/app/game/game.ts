import { Effect, Random, Schema, Stream } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import {
  ALL,
  BACK,
  Cell,
  Direction,
  FALL,
  HIT,
  RECOVER,
  REWIND,
  TICK,
  directionOf,
  isDirection,
  reverses,
  same,
  step,
  walk,
  wrap,
} from '../rules.ts';
import { Keyboard } from '../capabilities/keyboard.ts';
import { Referee } from '../capabilities/referee.ts';
import { Seed } from '../capabilities/seed.ts';

/** Where a game starts: three cells long, heading right. */
const START = walk({ x: 2, y: 6 }, 'RR');

const scored = Command.make('scored', {
  run: () =>
    Effect.gen(function* () {
      const referee = yield* Referee;
      yield* referee.scored;
    }),
});

const crashed = Command.make('crashed', {
  args: Schema.Struct({ body: Schema.Array(Cell) }),
  run: ({ body }) =>
    Effect.gen(function* () {
      const referee = yield* Referee;
      yield* referee.crashed(body);
    }),
});

/** The cells the snake is on: the last `length` of the track, up to its head. */
export const bodyOf = (model: {
  readonly track: ReadonlyArray<Cell>;
  readonly at: number;
  readonly length: number;
}) => model.track.slice(model.at - model.length + 1, model.at + 1);

/*
 * One game on the board. The Model keeps the track, every cell the head
 * has been on, and the snake is its last `length` cells up to `at`. The
 * track runs on past the edges, so a snake crossing one stays one line;
 * the board wraps it.
 *
 * A bite is played out in States, each with its own Worker, so nothing
 * ticks meanwhile: Bitten shows the bite where it happened, then moves
 * `at` back along the track a cell at a time; Recovering rests, then
 * plays on. The last bite is Crashed: shown, then reported, and the
 * Stage ends the game. The Stage decides the score and the lives; the
 * Game tells it through the Referee.
 */
export const Game = Actor.define('Game', {
  requires: [Referee, Keyboard, Seed],
  props: Schema.Struct({ lives: Schema.Number }),
  model: Schema.Struct({
    track: Schema.Array(Cell),
    /** The head's place on the track. */
    at: Schema.Number,
    length: Schema.Number,
    /** The way it last moved. */
    direction: Direction,
    /** The way it moves next: a turn waits here for the next tick. */
    heading: Direction,
    food: Schema.NullOr(Cell),
  }),
  state: Schema.TaggedUnion({
    Running: {},
    Paused: {},
    /** Cells still to go back. */
    Bitten: { back: Schema.Number },
    Recovering: {},
    Crashed: {},
  }),
  message: Schema.TaggedUnion({
    Ticked: {},
    Turned: { to: Direction },
    /** Space was pressed: what it does depends on the State. */
    Space: {},
    /** The keys went back to the page: the game is out of view. */
    Away: {},
    Resumed: {},
    Rewound: {},
    FoodPlaced: { x: Schema.Number, y: Schema.Number },
  }),
});

/**
 * The head moved back along the track to `to`, never so far the tail runs
 * off its start, and facing the way it came there.
 */
const backTo = <
  M extends {
    readonly track: ReadonlyArray<Cell>;
    readonly at: number;
    readonly length: number;
    readonly direction: Direction;
  },
>(
  model: M,
  to: number,
): M => {
  const at = Math.max(model.length - 1, to);
  const direction =
    at > 0
      ? directionOf(model.track[at - 1]!, model.track[at]!)
      : model.direction;
  return { ...model, at, direction, heading: direction };
};

export const GameLive = Game.build({
  init: () => ({
    model: {
      track: START,
      at: START.length - 1,
      length: START.length,
      direction: 'right',
      heading: 'right',
      food: null,
    },
    state: { _tag: 'Running' },
  }),
  workers: {
    // Space and the keys going away, in every State; each State says what
    // they mean. The arrows are read only while Running, by `steer`.
    controls: {
      run: (self) =>
        Effect.gen(function* () {
          const keyboard = yield* Keyboard;
          yield* Stream.runForEach(keyboard.presses, (press) =>
            press === 'space'
              ? self.send({ _tag: 'Space' })
              : press === 'away'
                ? self.send({ _tag: 'Away' })
                : Effect.void,
          );
        }),
    },
    // Runs whenever there is no food: after a start, and after each bite.
    // The roll is seeded by where the snake is, so a replay never rolls.
    'place food': {
      while: ({ model }) => model.food === null,
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const { seed } = yield* Seed;
          const body = bodyOf(model).map(wrap);
          const free = ALL.filter((cell) => !body.some((b) => same(b, cell)));
          const pick = yield* Random.nextIntBetween(0, free.length, {
            halfOpen: true,
          }).pipe(Random.withSeed(`${seed}:${model.at}:${model.length}`));
          yield* self.send({ _tag: 'FoodPlaced', ...free[pick]! });
        }),
    },
  },
  on: {
    FoodPlaced: ({ x, y }, { model }) => ({
      model: { ...model, food: { x, y } },
    }),
  },
  states: {
    Running: {
      workers: {
        tick: {
          run: (self) =>
            Effect.forever(
              Effect.sleep(TICK).pipe(
                Effect.andThen(self.send({ _tag: 'Ticked' })),
              ),
            ),
        },
        steer: {
          run: (self) =>
            Effect.gen(function* () {
              const keyboard = yield* Keyboard;
              yield* Stream.runForEach(keyboard.presses, (press) =>
                isDirection(press)
                  ? self.send({ _tag: 'Turned', to: press })
                  : Effect.void,
              );
            }),
        },
      },
      on: {
        Turned: ({ to }, { model }) =>
          reverses(model.direction, to)
            ? {}
            : { model: { ...model, heading: to } },
        Space: () => ({ state: { _tag: 'Paused' } }),
        Away: () => ({ state: { _tag: 'Paused' } }),
        Ticked: (_, { model, props }) => {
          const { track, at, length, heading, food } = model;
          const next = step(track[at]!, heading);
          const spot = wrap(next);
          const eats = food !== null && same(spot, food);
          const body = bodyOf(model);
          // The tail moves out of the way, unless the snake grows this move.
          const hits = body
            .slice(eats ? 0 : 1)
            .some((cell) => same(wrap(cell), spot));
          // The last life is told once its bite has been seen.
          if (hits)
            return props.lives <= 1
              ? { state: { _tag: 'Crashed' } }
              : {
                  state: { _tag: 'Bitten', back: REWIND },
                  command: crashed({ body }),
                };
          return {
            model: {
              ...model,
              // Moving on from a rewind leaves the cells after `at` behind.
              track: [...track.slice(0, at + 1), next],
              at: at + 1,
              length: eats ? length + 1 : length,
              direction: heading,
              food: eats ? null : food,
            },
            ...(eats ? { command: scored() } : {}),
          };
        },
      },
    },
    Paused: {
      on: {
        Space: () => ({ state: { _tag: 'Running' } }),
        Resumed: () => ({ state: { _tag: 'Running' } }),
      },
    },
    Bitten: {
      workers: {
        rewind: {
          // A cell back at a time, for as long as Bitten lasts; the first
          // waits for the bite to be seen.
          run: (self) =>
            Effect.forever(
              Effect.gen(function* () {
                const { state } = yield* self.get;
                yield* Effect.sleep(state.back === REWIND ? HIT : BACK);
                yield* self.send({ _tag: 'Rewound' });
              }),
            ),
        },
      },
      on: {
        Rewound: (_, { model, state }) => {
          // The tail never goes back past the start of the track.
          const back = model.at > model.length - 1 ? state.back - 1 : 0;
          return {
            model: backTo(model, model.at - 1),
            state: back > 0 ? { _tag: 'Bitten', back } : { _tag: 'Recovering' },
          };
        },
        // Space skips the rest of the rewind, and plays on at once.
        Space: (_, { model, state }) => ({
          model: backTo(model, model.at - state.back),
          state: { _tag: 'Running' },
        }),
        Away: () => ({ state: { _tag: 'Paused' } }),
      },
    },
    Recovering: {
      workers: {
        recover: {
          run: (self) =>
            Effect.sleep(RECOVER).pipe(
              Effect.andThen(self.send({ _tag: 'Resumed' })),
            ),
        },
      },
      on: {
        Resumed: () => ({ state: { _tag: 'Running' } }),
        Space: () => ({ state: { _tag: 'Running' } }),
        Away: () => ({ state: { _tag: 'Paused' } }),
      },
    },
    Crashed: {
      workers: {
        report: {
          run: (self) =>
            Effect.gen(function* () {
              yield* Effect.sleep(FALL);
              const { model } = yield* self.get;
              const referee = yield* Referee;
              yield* referee.crashed(bodyOf(model));
            }),
        },
      },
      // Space ends the game now, rather than once the bite is seen.
      on: {
        Space: (_, { model }) => ({
          command: crashed({ body: bodyOf(model) }),
        }),
      },
    },
  },
});
