import { Effect, Fiber, Stream } from 'effect';
import { Auth } from '@kestack/auth-toolkit';
import { describe, expect, it } from 'vitest';
import { principalAt } from './caller.ts';
import { makeDeadlines } from './deadlines.ts';
import { sessionBound } from './session-bound.ts';

const member = { userId: 'u-ada', email: 'ada@demo', name: 'Ada' };

const asCaller = (until: number) =>
  Effect.provideService(Auth.User, principalAt({ member, until, at: 0 }, 0)!);

describe('handlers bound to the caller’s session', () => {
  it('ends a stream when the caller’s session does', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const deadlines = makeDeadlines({
          getAlarm: async () => null,
          setAlarm: async () => {},
        });
        const handlers = sessionBound(
          { watch: () => Stream.never, me: () => Effect.succeed('me') },
          deadlines,
        );
        const watching = yield* Effect.forkChild(
          Stream.runDrain(handlers.watch()).pipe(asCaller(1000)),
        );
        while (deadlines.pending() === 0)
          yield* Effect.promise(() => new Promise((done) => setTimeout(done)));
        yield* Effect.promise(() => deadlines.ring(999));
        expect(watching.pollUnsafe()).toBeUndefined();
        yield* Effect.promise(() => deadlines.ring(1000));
        yield* Fiber.join(watching);
        // A call that is no stream runs as it is.
        expect(yield* handlers.me().pipe(asCaller(1000))).toBe('me');
      }),
    ));
});
