import { Effect, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import { Answers } from '../../../capabilities/index.js';
import { answers } from '../index.js';

/*
 * Answers: a caller gets the outcome told for its own Answer id, and a
 * caller that stops waiting leaves nothing an outcome could reach.
 */

const run = <A, E>(effect: Effect.Effect<A, E, Answers>) =>
  Effect.runPromise(Effect.provide(effect, answers));

describe('Answers', () => {
  it('give each caller the outcome told for its id', () =>
    run(
      Effect.gen(function* () {
        const replies = yield* Answers;
        const one = yield* Effect.forkChild(replies.await('a1', Effect.void));
        const two = yield* Effect.forkChild(replies.await('a2', Effect.void));
        yield* Effect.yieldNow;
        yield* replies.settle('a2', { _tag: 'Refused', reason: 'no' });
        yield* replies.settle('a1', { _tag: 'Taken' });
        expect(yield* Fiber.join(one)).toEqual({ _tag: 'Taken' });
        expect(yield* Fiber.join(two)).toEqual({
          _tag: 'Refused',
          reason: 'no',
        });
      }),
    ));

  it('wait from before the send, so an outcome told while sending arrives', () =>
    run(
      Effect.gen(function* () {
        const replies = yield* Answers;
        const outcome = yield* replies.await(
          'a1',
          replies.settle('a1', { _tag: 'NotAsked' }),
        );
        expect(outcome).toEqual({ _tag: 'NotAsked' });
      }),
    ));

  it('drop an outcome told after its caller stopped waiting', () =>
    run(
      Effect.gen(function* () {
        const replies = yield* Answers;
        const gone = yield* Effect.forkChild(replies.await('a1', Effect.void));
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(gone);
        yield* replies.settle('a1', { _tag: 'Taken' });
        const late = yield* Effect.forkChild(replies.await('a1', Effect.void));
        yield* Effect.yieldNow;
        // The new caller waits for its own outcome, not the one dropped.
        expect(late.pollUnsafe()).toBeUndefined();
        yield* replies.settle('a1', { _tag: 'NotAsked' });
        expect(yield* Fiber.join(late)).toEqual({ _tag: 'NotAsked' });
      }),
    ));

  it('fail as the send fails, waiting for nothing', () =>
    run(
      Effect.gen(function* () {
        const replies = yield* Answers;
        const failed = yield* Effect.flip(
          replies.await('a1', Effect.fail('gone' as const)),
        );
        expect(failed).toBe('gone');
      }),
    ));
});
