import { Effect, Fiber, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { Auth } from '@kestack/auth-toolkit';
import { describe, expect, it } from 'vitest';
import { principalAt } from './caller.ts';
import { sessionBound } from './session-bound.ts';

const member = { userId: 'u-ada', email: 'ada@demo', name: 'Ada' };

const asCaller = (until: number) =>
  Effect.provideService(Auth.User, principalAt({ member, until }, 0)!);

describe('handlers bound to the caller’s session', () => {
  it('ends a stream when the caller’s session does', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const handlers = sessionBound({
          watch: () => Stream.never,
          me: () => Effect.succeed('me'),
        });
        const watching = yield* Effect.forkChild(
          Stream.runDrain(handlers.watch()).pipe(asCaller(1000)),
        );
        yield* TestClock.adjust('999 millis');
        expect(watching.pollUnsafe()).toBeUndefined();
        yield* TestClock.adjust('1 millis');
        yield* Fiber.join(watching);
        // A call that is no stream runs as it is.
        expect(yield* handlers.me().pipe(asCaller(1000))).toBe('me');
      }).pipe(Effect.provide(TestClock.layer())),
    ));
});
