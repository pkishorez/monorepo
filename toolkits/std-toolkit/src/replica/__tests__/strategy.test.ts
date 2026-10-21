import { Effect, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { newToOld, oldToNew } from '../index.js';
import type { Wire } from './fixtures.js';

const entity = (id: string): Wire => ({
  value: { id },
  meta: { _e: 'Entry', _v: 'v1', _d: false, _u: 'same-transaction' },
});

describe('Strategies', () => {
  it('pages through all records tied on _u and resumes after the last one', async () => {
    const records = ['a', 'b', 'c', 'd', 'e'].map(entity);
    const strategy = oldToNew({
      fetch: ({ after }) =>
        Effect.succeed(
          records
            .slice(
              after === null
                ? 0
                : records.findIndex(
                    (row) =>
                      (row.value as { id: string }).id ===
                      (after.value as { id: string }).id,
                  ) + 1,
            )
            .slice(0, 2),
        ),
    });
    const batches = await Effect.runPromise(
      Stream.runCollect(
        strategy.run({ key: undefined, state: strategy.initial }),
      ),
    );
    expect(batches.flatMap(({ entities }) => entities)).toEqual(records);
    expect(batches.at(-1)?.state.cursor).toEqual(records.at(-1));
  });

  it('fills older pages whose records share _u', async () => {
    const records = ['e', 'd', 'c', 'b', 'a'].map(entity);
    const strategy = newToOld({
      fetch: () => Effect.succeed([]),
      fetchOlder: ({ before }) =>
        Effect.succeed(
          records
            .slice(
              before === null
                ? 0
                : records.findIndex(
                    (row) =>
                      (row.value as { id: string }).id ===
                      (before.value as { id: string }).id,
                  ) + 1,
            )
            .slice(0, 2),
        ),
    });
    const batches = await Effect.runPromise(
      Stream.runCollect(
        strategy.run({ key: undefined, state: strategy.initial }),
      ),
    );
    expect(batches.flatMap(({ entities }) => entities)).toEqual(records);
    expect(batches.at(-1)?.state.reachedOldest).toBe(true);
  });

  it('fetches the newest page again after a previously empty run', async () => {
    let records: Wire[] = [];
    let reads = 0;
    const strategy = newToOld({
      fetch: () => Effect.succeed([]),
      fetchOlder: ({ before }) =>
        Effect.sync(() => {
          reads++;
          return records
            .slice(
              before === null
                ? 0
                : records.findIndex(
                    (row) =>
                      (row.value as { id: string }).id ===
                      (before.value as { id: string }).id,
                  ) + 1,
            )
            .slice(0, 2);
        }),
    });
    const initial = await Effect.runPromise(
      Stream.runCollect(
        strategy.run({ key: undefined, state: strategy.initial }),
      ),
    );
    records = ['e', 'd', 'c', 'b', 'a'].map(entity);
    const reopened = await Effect.runPromise(
      Stream.runCollect(
        strategy.run({ key: undefined, state: initial.at(-1)!.state }),
      ),
    );
    expect(reads).toBeGreaterThan(1);
    expect(reopened.flatMap(({ entities }) => entities)).toEqual(records);
  });
});
