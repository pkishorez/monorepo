import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { superviseStrategy } from '../index.js';
import {
  leadershipIdentity,
  makeLeadership,
} from '../../../runtime/leadership/index.js';

const identity = leadershipIdentity({
  collectionName: 'test.items',
  partitionKey: '__total__',
  role: { _tag: 'Strategy', name: 'test' },
});

describe('strategy lifecycle', () => {
  it('closes each failed attempt before retrying in a fresh scope', async () => {
    let attempts = 0;
    let finalizers = 0;

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            superviseStrategy({
              leadership: makeLeadership(undefined),
              identity,
              run: () =>
                Effect.gen(function* () {
                  attempts += 1;
                  yield* Effect.addFinalizer(() =>
                    Effect.sync(() => {
                      finalizers += 1;
                    }),
                  );
                  if (attempts === 1) yield* Effect.fail('retry');
                }),
              onError: () => Effect.void,
            }),
          );

          yield* Effect.yieldNow;
          expect(attempts).toBe(1);
          expect(finalizers).toBe(1);

          yield* TestClock.adjust(3_000);
          yield* Effect.yieldNow;
          expect(attempts).toBe(2);
          expect(finalizers).toBe(2);
          yield* Fiber.interrupt(fiber);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    );

    expect(attempts).toBe(2);
    expect(finalizers).toBe(2);
  });

  it('keeps leadership after a successful finite attempt until interruption', async () => {
    let attempts = 0;

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            superviseStrategy({
              leadership: makeLeadership(undefined),
              identity,
              run: () =>
                Effect.sync(() => {
                  attempts += 1;
                }),
              onError: () => Effect.void,
            }),
          );

          yield* Effect.yieldNow;
          expect(attempts).toBe(1);
          yield* Fiber.interrupt(fiber);
        }),
      ),
    );
  });
});
