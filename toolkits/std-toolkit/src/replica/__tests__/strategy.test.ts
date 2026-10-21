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

  it('reads its Settle Window again, and never saves its cursor inside it', async () => {
    const at = (id: string, seconds: number): Wire => ({
      value: { id },
      meta: {
        _e: 'Entry',
        _v: 'v1',
        _d: false,
        _u: new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
      },
    });
    let records = [at('a', 0), at('b', 5), at('c', 12)];
    const afters: Array<string | null> = [];
    const strategy = oldToNew({
      settleWindow: '10 seconds',
      fetch: ({ after }) =>
        Effect.sync(() => {
          afters.push(after?.meta._u ?? null);
          return records
            .filter((each) => after === null || each.meta._u > after.meta._u)
            .sort((left, right) => (left.meta._u < right.meta._u ? -1 : 1));
        }),
    });
    const first = await Effect.runPromise(
      Stream.runCollect(
        strategy.run({ key: undefined, state: strategy.initial }),
      ),
    );
    // Only `a` is more than 10 seconds older than `c`, the newest read.
    expect(first.at(-1)?.state.cursor).toEqual(records[0]);

    // A write the Backend made readable late, older than `c`.
    records = [...records, at('late', 4)];
    afters.length = 0;
    const again = await Effect.runPromise(
      Stream.runCollect(
        strategy.run({ key: undefined, state: first.at(-1)!.state }),
      ),
    );
    expect(afters[0]).toBe(records[0]!.meta._u);
    expect(again.flatMap(({ entities }) => entities)).toContainEqual(
      at('late', 4),
    );
  });

  it('settles across pages shorter than its Settle Window', async () => {
    const at = (seconds: number): Wire => ({
      value: { id: `e${seconds}` },
      meta: {
        _e: 'Entry',
        _v: 'v1',
        _d: false,
        _u: new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
      },
    });
    // 31 records a second apart, read three at a time.
    const records = Array.from({ length: 31 }, (_, index) => at(index));
    const strategy = oldToNew({
      settleWindow: '10 seconds',
      fetch: ({ after }) =>
        Effect.succeed(
          records
            .filter((each) => after === null || each.meta._u > after.meta._u)
            .slice(0, 3),
        ),
    });
    const batches = await Effect.runPromise(
      Stream.runCollect(
        strategy.run({ key: undefined, state: strategy.initial }),
      ),
    );
    // Settled at the newest record 10 seconds older than the newest read.
    expect(batches.at(-1)?.state.cursor).toEqual(records[20]);
  });

  it('holds its first top back by its Settle Window', async () => {
    const at = (seconds: number): Wire => ({
      value: { id: `e${seconds}` },
      meta: {
        _e: 'Entry',
        _v: 'v1',
        _d: false,
        _u: new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
      },
    });
    const newestFirst = [at(30), at(25), at(15), at(5)];
    const strategy = newToOld({
      settleWindow: '10 seconds',
      fetch: () => Effect.succeed([]),
      fetchOlder: ({ before }) =>
        Effect.succeed(
          newestFirst.filter(
            (each) => before === null || each.meta._u < before.meta._u,
          ),
        ),
    });
    const batches = await Effect.runPromise(
      Stream.runCollect(
        strategy.run({ key: undefined, state: strategy.initial }),
      ).pipe(
        Effect.timeout('1 second'),
        Effect.orElseSucceed(() => []),
      ),
    );
    const first = Array.from(batches)[0];
    // Only `15` and older are settled: forward reading resumes after it.
    expect(first?.state.slices.at(-1)?.high).toEqual(at(15));
  });
});
