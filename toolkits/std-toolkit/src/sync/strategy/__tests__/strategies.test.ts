import { Effect, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../../core/index.js';
import { backend, todo, type Todo } from '../../__tests__/support.js';
import { settledCursor, strategy, type SyncStrategy } from '../index.js';

const run = <S>(
  s: SyncStrategy<Todo, S>,
  options: { state?: S; window?: number; take?: number } = {},
) => {
  const stream = s.run({
    state: options.state ?? s.initial,
    settledCursor: settledCursor(options.window ?? 0),
  });
  return Effect.runPromise(
    Stream.runCollect(
      options.take === undefined ? stream : Stream.take(stream, options.take),
    ),
  );
};

const ids = (entities: ReadonlyArray<Entity<Todo>>) =>
  entities.map((entity) => entity.value.id);

describe('settledCursor', () => {
  const batch = [todo('a', 1), todo('b', 4), todo('c', 10)];

  it('is the newest Entity when the window is off', () => {
    expect(settledCursor(0)(batch)?.value.id).toBe('c');
  });

  it('stays the window behind the newest _u in the batch', () => {
    expect(settledCursor(5_000)(batch)?.value.id).toBe('b');
    expect(settledCursor(20_000)(batch)).toBeNull();
  });
});

describe('oldToNew', () => {
  it('catches up page by page, saving the newest Entity, then ends', async () => {
    const server = backend([todo('a', 1), todo('b', 2), todo('c', 3)]);
    const yields = await run(strategy.oldToNew({ fetch: server.fetch }));
    expect(yields.map((y) => ids(y.entities))).toEqual([['a', 'b'], ['c']]);
    expect(yields.at(-1)?.state.cursor?.value.id).toBe('c');
  });

  it('resumes after the saved cursor', async () => {
    const server = backend([todo('a', 1), todo('b', 2), todo('c', 3)]);
    const yields = await run(strategy.oldToNew({ fetch: server.fetch }), {
      state: { cursor: todo('b', 2) },
    });
    expect(yields.flatMap((y) => ids(y.entities))).toEqual(['c']);
  });

  it('stops when an inclusive Backend repeats its last page', async () => {
    const last = todo('a', 1);
    const yields = await run(
      strategy.oldToNew({ fetch: () => Effect.succeed([last]) }),
    );
    expect(yields.map((y) => ids(y.entities))).toEqual([['a'], ['a']]);
  });

  it('saves its cursor the Settle Window behind what it read', async () => {
    const server = backend([todo('a', 1), todo('b', 8), todo('c', 10)], 10);
    const yields = await run(strategy.oldToNew({ fetch: server.fetch }), {
      window: 5_000,
    });
    expect(yields.at(-1)?.state.cursor?.value.id).toBe('a');
  });

  it('re-reads the Settle Window on every poll', async () => {
    const server = backend([todo('a', 1), todo('b', 8)], 10);
    const yields = await run(
      strategy.oldToNew({ fetch: server.fetch, pollEvery: '1 millis' }),
      { window: 5_000, take: 2 },
    );
    expect(yields.map((y) => ids(y.entities))).toEqual([['a', 'b'], ['b']]);
  });

  it('subscribes from the saved cursor and reopens a feed that ends', async () => {
    const afters: Array<string | null> = [];
    const yields = await run(
      strategy.oldToNew({
        subscribe: ({ after }) => {
          afters.push(after?.value.id ?? null);
          const next = after === null ? todo('a', 1) : todo('b', 2);
          return Stream.make([next]);
        },
      }),
      { take: 2 },
    );
    expect(yields.flatMap((y) => ids(y.entities))).toEqual(['a', 'b']);
    expect(afters).toEqual([null, 'a']);
  });

  it('catches up with fetch, then subscribes after the newest read', async () => {
    const server = backend([todo('a', 1), todo('b', 2), todo('c', 3)]);
    const afters: Array<string | null> = [];
    const yields = await run(
      strategy.oldToNew({
        fetch: server.fetch,
        subscribe: ({ after }) => {
          afters.push(after?.value.id ?? null);
          return Stream.make([todo('live', 4)]);
        },
      }),
      { take: 3 },
    );
    expect(yields.flatMap((y) => ids(y.entities))).toEqual([
      'a',
      'b',
      'c',
      'live',
    ]);
    expect(afters).toEqual(['c']);
  });
});

describe('newToOld', () => {
  const rows = () =>
    [1, 2, 3, 4, 5].map((second) => todo(`t${second}`, second));

  it('reads the newest page first, then fills in back to the oldest', async () => {
    const server = backend(rows());
    const yields = await run(
      strategy.newToOld({ fetch: server.fetch, fetchOlder: server.fetchOlder }),
    );
    expect(ids(yields[0]!.entities)).toEqual(['t5', 't4']);
    const final = yields.at(-1)!.state;
    expect(final.reachedOldest).toBe(true);
    expect(final.slices.map((s) => [s.low.value.id, s.high.value.id])).toEqual([
      ['t1', 't5'],
    ]);
  });

  it('fills the gap a reload left between the saved top and now', async () => {
    const server = backend(rows());
    const saved = {
      slices: [{ low: todo('t1', 1), high: todo('t2', 2) }],
      reachedOldest: true,
    };
    server.add(todo('t6', 6), todo('t7', 7));
    const yields = await run(
      strategy.newToOld({ fetch: server.fetch, fetchOlder: server.fetchOlder }),
      { state: saved },
    );
    const final = yields.at(-1)!.state;
    expect(final.slices.map((s) => [s.low.value.id, s.high.value.id])).toEqual([
      ['t1', 't7'],
    ]);
  });
});
