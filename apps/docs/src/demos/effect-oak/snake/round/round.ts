import { Context, Effect, Random, Schema } from 'effect';
import { Actor } from 'effect-oak';
import {
  bitesItself,
  Body,
  contains,
  Direction,
  isOpposite,
  move,
  Position,
  same,
  start,
  step,
  GRID,
} from './body.js';

/*
 * One round of snake: NotStarted → Playing ⇄ Paused → GameOver.
 *
 * The snake moves one cell per Tick: a game of discrete steps, so it ticks.
 * A Worker owned by the Playing State sends them, sleeping in the app's Time
 * between each, sooner as the score grows: it reads the points before every
 * sleep. Pausing leaves Playing, which stops the Worker; resuming starts it
 * again. A new apple's place is random, so it comes back from a Command as a
 * Message. When the snake bites itself the round tells the Scores Request
 * how it did.
 */

/** Whoever keeps the high score: the arcade. */
export class Scores extends Context.Service<
  Scores,
  { readonly finished: (points: number) => Effect.Effect<void> }
>()('docs/snake/Scores') {}

const POINTS_PER_APPLE = 10;
const HEAD = { x: 10, y: 10 };

/** Milliseconds between steps: 150, down to 80 as the score grows. */
const interval = (points: number) => Math.max(80, 150 - points);

/** A random free cell for the apple. */
const placeApple = (body: Body) => ({
  name: 'placeApple',
  run: Effect.gen(function* () {
    for (;;) {
      const position = {
        x: yield* Random.nextIntBetween(0, GRID, { halfOpen: true }),
        y: yield* Random.nextIntBetween(0, GRID, { halfOpen: true }),
      };
      if (!contains(body, position))
        return { _tag: 'CompletedGenerateApplePosition' as const, position };
    }
  }),
});

const report = (points: number) => ({
  name: 'report',
  run: Effect.gen(function* () {
    yield* (yield* Scores).finished(points);
  }),
});

const fresh = () => {
  const snake = start(HEAD);
  return {
    model: {
      snake,
      apple: { x: 15, y: 15 },
      direction: 'Right' as const,
      nextDirection: 'Right' as const,
      points: 0,
    },
    state: { _tag: 'NotStarted' as const },
  };
};

export const Round = Actor.make('Round', {
  requires: { scores: Scores },
  model: Schema.Struct({
    snake: Body,
    apple: Position,
    direction: Direction,
    nextDirection: Direction,
    points: Schema.Number,
  }),
  state: Schema.TaggedUnion({
    NotStarted: {},
    Playing: {},
    Paused: {},
    GameOver: {},
  }),
  message: Schema.TaggedUnion({
    PressedStart: {},
    PressedPause: {},
    PressedRestart: {},
    Turned: { direction: Direction },
    Ticked: {},
    CompletedGenerateApplePosition: { position: Position },
  }),
}).build({
  init: fresh,
  workers: {
    /** The first apple, once the round exists. */
    seed: {
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          yield* self.send(yield* placeApple(model.snake).run);
        }),
    },
    /** One step per interval, read from the points before each sleep. */
    tick: {
      in: 'Playing',
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          yield* Effect.sleep(interval(model.points));
          yield* self.send({ _tag: 'Ticked' });
        }).pipe(Effect.forever),
    },
  },
  update: {
    NotStarted: {
      PressedStart: () => ({ state: { _tag: 'Playing' } }),
    },
    Playing: {
      Turned: ({ direction }, { model }) => ({
        model: { ...model, nextDirection: direction },
      }),
      PressedPause: () => ({ state: { _tag: 'Paused' } }),
      Ticked: (_, { model }) => {
        const direction = isOpposite(model.direction, model.nextDirection)
          ? model.direction
          : model.nextDirection;
        const eats = same(move(model.snake[0], direction), model.apple);
        const snake = step(model.snake, direction, eats);
        if (bitesItself(snake))
          return {
            state: { _tag: 'GameOver' },
            command: report(model.points),
          };
        const points = eats ? model.points + POINTS_PER_APPLE : model.points;
        return {
          model: { ...model, snake, direction, points },
          command: eats ? placeApple(snake) : undefined,
        };
      },
    },
    Paused: {
      PressedPause: () => ({ state: { _tag: 'Playing' } }),
    },
    '*': {
      PressedRestart: () => {
        const next = fresh();
        return { ...next, command: placeApple(next.model.snake) };
      },
      CompletedGenerateApplePosition: ({ position }, { model }) => ({
        model: { ...model, apple: position },
      }),
    },
  },
});
