import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../../../core/index.js';
import { getOnce } from '../index.js';

type Settings = { theme: string };

const flow = {
  log: () => Effect.void,
  state: () => Effect.void,
  withSpan:
    () =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect,
};

describe('get-once', () => {
  it('fetches and writes the singleton as server truth', async () => {
    const written: EntityType<Settings>[][] = [];
    const strategy = getOnce<Settings>({
      get: () =>
        Effect.succeed({
          value: { theme: 'dark' },
          meta: { _e: 'Settings', _v: 'v1', _u: '1' },
        }),
    });

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          yield* strategy.run({
            flow,
            writeServerTruth: (entities) =>
              Effect.sync(() => {
                written.push(entities);
              }),
            getState: Effect.succeed(null),
            setState: () => Effect.void,
            scope,
          });
        }),
      ),
    );

    expect(written).toEqual([
      [
        {
          value: { theme: 'dark' },
          meta: { _e: 'Settings', _v: 'v1', _u: '1', _d: false },
        },
      ],
    ]);
  });
});
