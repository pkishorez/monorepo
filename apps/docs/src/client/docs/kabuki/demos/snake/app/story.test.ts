import { Effect, Layer, PubSub, Stream } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { History, Runtime, Snapshot } from '@kestack/kabuki';
import { describe, expect, it } from 'vitest';
import { BACK, FALL, HIT, RECOVER, REWIND, TICK, wrap } from './rules.ts';
import { Keyboard } from './capabilities/keyboard.ts';
import { Seed } from './capabilities/seed.ts';
import type { Press } from './capabilities/keyboard.ts';
import { StageLive } from './stage/stage.ts';

const GAME = 'Stage/game#1';

const timed = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

/** The app with a Keyboard pressed by hand, and a way to press it. */
const started = (seed = 'test') =>
  Effect.gen(function* () {
    const keys = yield* PubSub.unbounded<Press>();
    const app = yield* Runtime.start(
      StageLive,
      Layer.mergeAll(
        Layer.succeed(Keyboard, { presses: Stream.fromPubSub(keys) }),
        Layer.succeed(Seed, { seed }),
      ),
    );
    const press = (key: Press) =>
      PubSub.publish(keys, key).pipe(Effect.andThen(Effect.yieldNow));
    yield* Effect.yieldNow;
    return { app, press };
  });

/** Started, with a game under way. */
const playing = (seed?: string) =>
  Effect.gen(function* () {
    const game = yield* started(seed);
    yield* game.press('space');
    return game;
  });

const ticks = (n: number) => TestClock.adjust(`${n * TICK} millis`);
/** Moves the clock on, once the Workers a State just started are waiting. */
const after = (millis: number) =>
  Effect.yieldNow.pipe(Effect.andThen(TestClock.adjust(`${millis} millis`)));
/** The whole of a rewind: the bite shown, each cell back, the rest. */
const REWOUND = HIT + (REWIND - 1) * BACK + RECOVER;

const game = (app: Runtime.Running<unknown>) =>
  Snapshot.instanceAt(app.snapshot(), GAME) as
    | undefined
    | {
        state: { _tag: string };
        model: {
          track: ReadonlyArray<{ x: number; y: number }>;
          at: number;
          length: number;
          food: { x: number; y: number } | null;
        };
      };

/** The head's cell on the board. */
const head = (app: Runtime.Running<unknown>) => {
  const model = game(app)!.model;
  return wrap(model.track[model.at]!);
};

/** Grown to five cells, head at 8,6, by food put right in front of it. */
const grown = (seed?: string) =>
  Effect.gen(function* () {
    const playing_ = yield* playing(seed);
    yield* ticks(2);
    for (const x of [7, 8]) {
      playing_.app.send(GAME, { _tag: 'FoodPlaced', x, y: 6 });
      yield* ticks(1);
    }
    return playing_;
  });

/** Down, left and up: a tight loop that bites the body. */
const bite = (press: (key: Press) => Effect.Effect<void>) =>
  Effect.gen(function* () {
    for (const key of ['down', 'left', 'up'] as const) {
      yield* press(key);
      yield* ticks(1);
    }
  });

const workers = (app: Runtime.Running<unknown>, id: string) =>
  app.workers(id).map((worker) => worker.name);

describe('Snake', () => {
  it('Space starts a game: the Stage Invokes a Game, Running its Workers', () =>
    timed(
      Effect.gen(function* () {
        const { app, press } = yield* started();
        expect(app.snapshot().state).toEqual({ _tag: 'Ready' });
        yield* press('space');
        expect(app.snapshot().state).toEqual({ _tag: 'Playing' });
        expect(workers(app, GAME)).toEqual(
          expect.arrayContaining(['tick', 'steer']),
        );
        expect(workers(app, 'Stage')).toEqual([]);
      }),
    ));

  it('each tick moves the head one cell; food is placed by a Message', () =>
    timed(
      Effect.gen(function* () {
        const { app } = yield* playing();
        expect(game(app)!.model.food).not.toBeNull();
        expect(head(app)).toEqual({ x: 4, y: 6 });
        yield* ticks(2);
        expect(head(app)).toEqual({ x: 6, y: 6 });
      }),
    ));

  it('a turn waits for the next tick, and a turn back on itself is ignored', () =>
    timed(
      Effect.gen(function* () {
        const { app, press } = yield* playing();
        yield* press('left');
        yield* ticks(1);
        expect(head(app)).toEqual({ x: 5, y: 6 });
        yield* press('up');
        yield* ticks(1);
        expect(head(app)).toEqual({ x: 5, y: 5 });
      }),
    ));

  it('eating grows the snake and scores through the Referee', () =>
    timed(
      Effect.gen(function* () {
        const { app } = yield* playing();
        app.send(GAME, { _tag: 'FoodPlaced', x: 5, y: 6 });
        yield* ticks(1);
        expect(game(app)!.model.length).toBe(4);
        expect(app.snapshot().model).toMatchObject({ score: 1, best: 1 });
      }),
    ));

  it('there are no walls: off one edge, on at the other', () =>
    timed(
      Effect.gen(function* () {
        const { app } = yield* playing();
        yield* ticks(8);
        expect(head(app)).toEqual({ x: 0, y: 6 });
        expect(app.snapshot().model).toMatchObject({ lives: 3 });
      }),
    ));

  it('a bite plays out in States: shown, then back a cell at a time, then on', () =>
    timed(
      Effect.gen(function* () {
        const { app, press } = yield* grown();
        expect(game(app)!.model.length).toBe(5);
        yield* bite(press);
        // The bite is shown where it happened, and a life is gone.
        const bitten = game(app)!.model.at;
        expect(game(app)!.state).toEqual({ _tag: 'Bitten', back: REWIND });
        expect(app.snapshot().model).toMatchObject({ lives: 2 });
        expect(workers(app, GAME)).toEqual(['controls', 'rewind']);

        yield* after(HIT);
        expect(game(app)!.model.at).toBe(bitten - 1);
        yield* after(BACK);
        expect(game(app)!.model.at).toBe(bitten - 2);
        yield* after(BACK);
        expect(game(app)!.model.at).toBe(bitten - REWIND);
        expect(head(app)).toEqual({ x: 7, y: 6 });
        expect(game(app)!.state).toEqual({ _tag: 'Recovering' });

        yield* after(RECOVER);
        expect(game(app)!.state).toEqual({ _tag: 'Running' });
        yield* ticks(1);
        expect(head(app)).toEqual({ x: 8, y: 6 });
      }),
    ));

  it('the last bite is shown, then the game ends: the Game and its Workers stop', () =>
    timed(
      Effect.gen(function* () {
        const { app, press } = yield* grown();
        // Each rewind lands one move before the loop starts again.
        for (const _ of [1, 2]) {
          yield* bite(press);
          yield* after(REWOUND);
          yield* ticks(1);
        }
        yield* bite(press);
        expect(game(app)!.state).toEqual({ _tag: 'Crashed' });
        expect(app.snapshot().state).toEqual({ _tag: 'Playing' });

        yield* after(FALL);
        const over = app.snapshot().state as { _tag: string; body: unknown[] };
        expect(over._tag).toBe('Over');
        expect(over.body).toHaveLength(5);
        expect(game(app)).toBeUndefined();
        expect(workers(app, GAME)).toEqual([]);
        expect(workers(app, 'Stage')).toEqual(['start']);

        yield* press('space');
        expect(app.snapshot().state).toEqual({ _tag: 'Playing' });
        expect(
          Snapshot.instanceAt(app.snapshot(), 'Stage/game#2'),
        ).toBeDefined();
      }),
    ));

  it('Space pauses: the tick Worker stops until Space again', () =>
    timed(
      Effect.gen(function* () {
        const { app, press } = yield* playing();
        yield* press('space');
        expect(game(app)!.state).toEqual({ _tag: 'Paused' });
        expect(workers(app, GAME)).not.toContain('tick');
        yield* ticks(5);
        expect(head(app)).toEqual({ x: 4, y: 6 });
        yield* press('space');
        yield* ticks(1);
        expect(head(app)).toEqual({ x: 5, y: 6 });
      }),
    ));

  it('Space during a rewind skips the rest of it, and plays on at once', () =>
    timed(
      Effect.gen(function* () {
        const { app, press } = yield* grown();
        yield* bite(press);
        const bitten = game(app)!.model.at;
        yield* press('space');
        expect(game(app)!.state).toEqual({ _tag: 'Running' });
        expect(game(app)!.model.at).toBe(bitten - REWIND);
        expect(head(app)).toEqual({ x: 7, y: 6 });
      }),
    ));

  it('the keys going away pauses a running game; Space plays on', () =>
    timed(
      Effect.gen(function* () {
        const { app, press } = yield* playing();
        yield* press('away');
        expect(game(app)!.state).toEqual({ _tag: 'Paused' });
        yield* press('space');
        expect(game(app)!.state).toEqual({ _tag: 'Running' });
      }),
    ));

  it('the last bite: Space ends the game at once', () =>
    timed(
      Effect.gen(function* () {
        const { app, press } = yield* grown();
        for (const _ of [1, 2]) {
          yield* bite(press);
          yield* press('space');
          yield* ticks(1);
        }
        yield* bite(press);
        expect(game(app)!.state).toEqual({ _tag: 'Crashed' });
        yield* press('space');
        expect(app.snapshot().state).toMatchObject({ _tag: 'Over' });
      }),
    ));

  it('a saved History replays to the same Snapshot', () =>
    timed(
      Effect.gen(function* () {
        const { app, press } = yield* playing();
        yield* ticks(3);
        yield* press('down');
        yield* ticks(9);
        const saved = JSON.parse(JSON.stringify(app.history.save()));
        expect(yield* History.load(StageLive, saved).seek()).toEqual(
          app.snapshot(),
        );
      }),
    ));

  it('the same seed places the same food', () =>
    timed(
      Effect.gen(function* () {
        const foodOf = (seed: string) =>
          Effect.scoped(
            Effect.gen(function* () {
              const { app } = yield* playing(seed);
              return game(app)!.model.food;
            }),
          );
        expect(yield* foodOf('a')).toEqual(yield* foodOf('a'));
      }),
    ));
});
