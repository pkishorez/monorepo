import { Effect, Random, Schema } from 'effect';
import { Node } from 'effect-oak';
import { bounce } from './bounce.js';

/*
 * Balls bouncing in a box: Running or Paused.
 *
 * Nothing ticks. The box keeps its own clock, which stops while Paused:
 * Running keeps the clock before it started and the Time it started at,
 * Paused keeps the clock's reading. Each ball keeps where it was launched,
 * how fast, and at what reading of the clock, so where it is at any moment
 * follows from that (`ballAt`). The View works it out at each Frame.
 */

export const WIDTH = 600;
export const HEIGHT = 400;

const RADIUS = { min: 8, max: 24 };
const SPEED = { min: 80, max: 240 };
const PALETTE = [
  '#ff2d55',
  '#ffcc00',
  '#34c759',
  '#5ac8fa',
  '#af52de',
  '#ff9500',
];

const Launch = {
  x: Schema.Number,
  y: Schema.Number,
  /** Box units per second. */
  vx: Schema.Number,
  vy: Schema.Number,
  radius: Schema.Number,
  color: Schema.String,
};

/** A ball: launched from `x, y` when the box's clock read `launched`. */
const Ball = Schema.Struct({
  id: Schema.Number,
  ...Launch,
  launched: Schema.Number,
});
type Ball = typeof Ball.Type;

/** A random ball at the point clicked: the randomness goes into a Message. */
const generateBall = (x: number, y: number) =>
  Effect.gen(function* () {
    const angle = yield* Random.nextBetween(0, Math.PI * 2);
    const speed = yield* Random.nextBetween(SPEED.min, SPEED.max);
    const radius = yield* Random.nextBetween(RADIUS.min, RADIUS.max);
    const color = yield* Random.nextIntBetween(0, PALETTE.length, {
      halfOpen: true,
    });
    return {
      _tag: 'CompletedGenerateBall' as const,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      color: PALETTE[color] ?? '#ffffff',
    };
  });

export const Box = Node.make('Box', {
  model: Schema.Struct({ balls: Schema.Array(Ball), nextId: Schema.Number }),
  state: Schema.TaggedUnion({
    Running: { before: Schema.Number, since: Schema.Number },
    Paused: { clock: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    ClickedCanvas: { x: Schema.Number, y: Schema.Number },
    CompletedGenerateBall: Launch,
    ClickedClear: {},
    ClickedTogglePlay: {},
  }),
}).build({
  init: () => ({
    model: { balls: [], nextId: 0 },
    state: { _tag: 'Running', before: 0, since: 0 },
  }),
  update: {
    Running: {
      ClickedTogglePlay: (_, { state, at }) => ({
        state: { _tag: 'Paused', clock: clockAt(state, at) },
      }),
    },
    Paused: {
      ClickedTogglePlay: (_, { state, at }) => ({
        state: { _tag: 'Running', before: state.clock, since: at },
      }),
    },
    '*': {
      ClickedCanvas: ({ x, y }) => ({ commands: [generateBall(x, y)] }),
      CompletedGenerateBall: (launch, { model, state, at }) => ({
        model: {
          balls: [
            ...model.balls,
            {
              id: model.nextId,
              x: launch.x,
              y: launch.y,
              vx: launch.vx,
              vy: launch.vy,
              radius: launch.radius,
              color: launch.color,
              launched: clockAt(state, at),
            },
          ],
          nextId: model.nextId + 1,
        },
      }),
      ClickedClear: (_, { model }) => ({ model: { ...model, balls: [] } }),
    },
  },
});

/** What the box's clock reads at Time `at`, in milliseconds. */
export const clockAt = (
  state:
    | {
        readonly _tag: 'Running';
        readonly before: number;
        readonly since: number;
      }
    | { readonly _tag: 'Paused'; readonly clock: number },
  at: number,
) =>
  state._tag === 'Paused' ? state.clock : state.before + (at - state.since);

/** Where a ball is when the box's clock reads `clock`. */
export const ballAt = (ball: Ball, clock: number) => {
  const seconds = Math.max(0, clock - ball.launched) / 1000;
  return {
    x: bounce(ball.x + ball.vx * seconds, ball.radius, WIDTH - ball.radius),
    y: bounce(ball.y + ball.vy * seconds, ball.radius, HEIGHT - ball.radius),
    radius: ball.radius,
    color: ball.color,
  };
};
