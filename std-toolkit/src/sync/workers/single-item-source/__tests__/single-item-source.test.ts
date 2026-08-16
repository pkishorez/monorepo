import { Effect, Fiber, Schedule, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import type { EntityType, SingleEntityType } from '../../../../core/index.js';
import type { SingleItemStrategy } from '../../../runtime/strategy-runtime/index.js';
import { singleItemSourceStrategy } from '../index.js';

type Settings = { theme: string };

const flow = {
  log: () => Effect.void,
  state: () => Effect.void,
  withSpan:
    () =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect,
};

const settings = (
  theme: string,
  updated: string,
): SingleEntityType<Settings> => ({
  value: { theme },
  meta: { _e: 'Settings', _v: 'v1', _u: updated },
});

const run = (strategy: SingleItemStrategy<Settings, null>) => {
  const written: EntityType<Settings>[] = [];
  const effect = Effect.scoped(
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      yield* strategy.run({
        flow,
        applyToSyncReplica: (entities) =>
          Effect.sync(() => {
            written.push(...entities);
          }),
        getState: Effect.succeed(null),
        setState: () => Effect.void,
        scope,
      });
    }),
  );
  return { effect, written };
};

describe('single-item-source', () => {
  it('fetches once and applies the value', async () => {
    const strategy = singleItemSourceStrategy<Settings>({
      source: ({ once }) =>
        once({ fetch: () => Effect.succeed(settings('dark', '1')) }),
    });
    const result = run(strategy);

    await Effect.runPromise(result.effect);

    expect(result.written.map((entity) => entity.value.theme)).toEqual([
      'dark',
    ]);
  });

  it('applies every subscribed complete value', async () => {
    const strategy = singleItemSourceStrategy<Settings>({
      source: ({ subscribe }) =>
        subscribe({
          open: () =>
            Stream.make(settings('dark', '1'), settings('light', '2')),
        }),
    });
    const result = run(strategy);

    await Effect.runPromise(result.effect);

    expect(result.written.map((entity) => entity.value.theme)).toEqual([
      'dark',
      'light',
    ]);
  });

  it('fetches immediately and then follows the polling Schedule', async () => {
    let revision = 0;
    const strategy = singleItemSourceStrategy<Settings>({
      source: ({ poll }) =>
        poll({
          fetch: () =>
            Effect.sync(() => {
              revision += 1;
              return settings(`theme-${revision}`, String(revision));
            }),
          schedule: Schedule.spaced('1 second').pipe(
            Schedule.upTo({ times: 1 }),
          ),
        }),
    });
    const result = run(strategy);

    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(result.effect);
        yield* TestClock.adjust('1 second');
        yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestClock.layer())),
    );

    expect(result.written.map((entity) => entity.value.theme)).toEqual([
      'theme-1',
      'theme-2',
    ]);
  });
});
