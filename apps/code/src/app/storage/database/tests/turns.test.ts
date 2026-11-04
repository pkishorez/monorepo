import { Deferred, Effect, Fiber, type Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { turns } from '../turns.ts';

/*
 * One store's rows in turn: what is asked of a row runs in the order
 * asked; a drop waits for what is under way of the rows it takes, and
 * what was asked of them before it, not yet run, is not made; and once
 * nothing is under way, nothing is held.
 */

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const of = (whose: string) => (row: string) => row === whose;

describe('turns', () => {
  it('runs what is asked of a row in the order asked', () =>
    run(
      Effect.gen(function* () {
        const turn = turns<string>(yield* Effect.scope);
        const order: Array<number> = [];
        const gate = yield* Deferred.make<void>();
        const first = yield* Effect.forkChild(
          turn.run({
            key: 'r',
            whose: 'm1',
            does: Effect.andThen(
              Deferred.await(gate),
              Effect.sync(() => void order.push(1)),
            ),
            skipped: undefined,
          }),
        );
        yield* Effect.yieldNow;
        const second = yield* Effect.forkChild(
          turn.run({
            key: 'r',
            whose: 'm1',
            does: Effect.sync(() => void order.push(2)),
            skipped: undefined,
          }),
        );
        yield* Effect.yieldNow;
        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(first);
        yield* Fiber.join(second);
        expect(order).toEqual([1, 2]);
      }),
    ));

  it('drops once what is under way of its rows is made, and skips what was asked before', () =>
    run(
      Effect.gen(function* () {
        const turn = turns<string>(yield* Effect.scope);
        const done: Array<string> = [];
        const gate = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();
        const writing = yield* Effect.forkChild(
          turn.run({
            key: 'r',
            whose: 'm1',
            does: Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(gate)),
              Effect.andThen(Effect.sync(() => void done.push('written'))),
            ),
            skipped: undefined,
          }),
        );
        yield* Deferred.await(started);
        const late = yield* Effect.forkChild(
          turn.run({
            key: 'r',
            whose: 'm1',
            does: Effect.sync(() => void done.push('late')),
            skipped: undefined,
          }),
        );
        yield* Effect.yieldNow;
        const dropping = yield* Effect.forkChild(
          turn.drop(
            of('m1'),
            Effect.sync(() => void done.push('dropped')),
          ),
        );
        yield* Effect.yieldNow;
        expect(done).toEqual([]);
        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(writing);
        yield* Fiber.join(late);
        yield* Fiber.join(dropping);
        expect(done).toEqual(['written', 'dropped']);
      }),
    ));

  it('leaves the rows of no one dropped to run', () =>
    run(
      Effect.gen(function* () {
        const turn = turns<string>(yield* Effect.scope);
        const made = yield* Effect.forkChild(
          turn.run({
            key: 'r',
            whose: 'm2',
            does: Effect.succeed('made'),
            skipped: 'skipped',
          }),
        );
        yield* turn.drop(of('m1'), Effect.void);
        expect(yield* Fiber.join(made)).toBe('made');
      }),
    ));

  it('skips a write read before one already made of the row', () =>
    run(
      Effect.gen(function* () {
        const turn = turns<string>(yield* Effect.scope);
        const gate = yield* Deferred.make<void>();
        const newer = yield* Effect.forkChild(
          turn.run({
            key: 'r',
            whose: 'm1',
            does: Effect.as(Deferred.await(gate), true),
            skipped: false,
            at: 2n,
          }),
        );
        yield* Effect.yieldNow;
        const older = yield* Effect.forkChild(
          turn.run({
            key: 'r',
            whose: 'm1',
            does: Effect.succeed(true),
            skipped: false,
            at: 1n,
          }),
        );
        yield* Deferred.succeed(gate, undefined);
        expect(yield* Fiber.join(newer)).toBe(true);
        expect(yield* Fiber.join(older)).toBe(false);
      }),
    ));

  it('holds nothing once nothing is under way', () =>
    run(
      Effect.gen(function* () {
        const turn = turns<string>(yield* Effect.scope);
        yield* Effect.all(
          [
            turn.run({
              key: 'a',
              whose: 'm1',
              does: Effect.void,
              skipped: undefined,
            }),
            turn.run({
              key: 'b',
              whose: 'm2',
              does: Effect.void,
              skipped: undefined,
            }),
            turn.drop(of('m1'), Effect.void),
          ],
          { concurrency: 'unbounded' },
        );
        expect(turn.holding()).toEqual({ rows: 0, drops: 0 });
      }),
    ));
});
