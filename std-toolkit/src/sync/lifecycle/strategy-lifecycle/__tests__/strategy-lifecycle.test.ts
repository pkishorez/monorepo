import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { superviseStrategy } from '../index.js';
import {
  leadershipIdentity,
  makeLeadership,
} from '../../../runtime/leadership/index.js';
import { inMemoryLeadership } from '../../../runtime/leadership/in-memory/index.js';
import type { StrategyFlow } from '../../../runtime/sync-flow/index.js';

const identity = leadershipIdentity({
  collectionName: 'test.items',
  partitionKey: '__total__',
  role: { _tag: 'Strategy', name: 'test' },
});

describe('strategy lifecycle', () => {
  it('records Leadership transitions on the strategy participant', async () => {
    const messages: string[] = [];
    const states: string[] = [];
    const flow: StrategyFlow = {
      log: (message, options) =>
        Effect.sync(() => {
          messages.push(String(message));
          states.push(String(options?.attributes?.leadership));
        }),
      withSpan: () => (effect) => effect,
    };
    const leadership = makeLeadership(inMemoryLeadership());

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            superviseStrategy({
              leadership,
              identity,
              flow,
              run: () => Effect.void,
              onError: () => Effect.void,
            }),
          );
          yield* Effect.yieldNow;
          expect(messages).toEqual([
            'Leadership requested',
            'Leadership acquired',
          ]);
          expect(states).toEqual(['waiting', 'leading']);
          yield* Fiber.interrupt(fiber);
          expect(messages).toEqual([
            'Leadership requested',
            'Leadership acquired',
            'Leadership released',
          ]);
          expect(states).toEqual(['waiting', 'leading', 'released']);
        }),
      ),
    );

    await leadership.dispose();
  });

  it('releases a follower that is interrupted while still waiting', async () => {
    const states: string[] = [];
    const leadership = makeLeadership(inMemoryLeadership());
    const supervise = (onLeadership: (state: string) => Effect.Effect<void>) =>
      superviseStrategy({
        leadership,
        identity,
        run: () => Effect.void,
        onError: () => Effect.void,
        onLeadership,
      });

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const leader = yield* Effect.forkChild(supervise(() => Effect.void));
          yield* Effect.yieldNow;
          const follower = yield* Effect.forkChild(
            supervise((state) => Effect.sync(() => void states.push(state))),
          );
          yield* Effect.yieldNow;
          expect(states).toEqual(['waiting']);
          yield* Fiber.interrupt(follower);
          expect(states).toEqual(['waiting', 'released']);
          yield* Fiber.interrupt(leader);
        }),
      ),
    );

    await leadership.dispose();
  });

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
