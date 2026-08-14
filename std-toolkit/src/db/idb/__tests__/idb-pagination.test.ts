import 'fake-indexeddb/auto';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type {
  EncodedItem,
  QueryPosition,
  StdTableContract,
} from '../../std-table/contract/index.js';
import { IDB } from '../index.js';
import { makeTableContract } from '../table/index.js';

const item = (sk: string, indexSort?: string): EncodedItem => ({
  pk: 'items',
  sk,
  meta: { _e: 'item', _v: '1', _u: '1', _d: false },
  data: { sk },
  keys: indexSort === undefined ? {} : { GSI1PK: 'group', GSI1SK: indexSort },
});

const makeRuntime = async (indexed = false, factory?: IDBFactory) => {
  const database = IDB.database({
    databaseName: `pagination-${crypto.randomUUID()}`,
    ...(factory === undefined ? {} : { indexedDB: factory }),
  });
  await Effect.runPromise(
    database.setup(
      'records',
      indexed
        ? [
            {
              name: 'GSI1',
              keyPath: ['GSI1PK', 'GSI1SK'],
            },
          ]
        : [],
    ),
  );
  const table = {
    localSecondaryIndexes: {},
    globalSecondaryIndexes: indexed
      ? {
          GSI1: {
            name: 'GSI1',
            kind: 'gsi' as const,
            pk: 'GSI1PK',
            sk: 'GSI1SK',
          },
        }
      : {},
  };
  return makeTableContract(database, table, 'records');
};

const write = async (
  runtime: StdTableContract,
  ...items: readonly EncodedItem[]
) => {
  for (const stored of items)
    await Effect.runPromise(runtime.writeItem({ item: stored }));
};

const primaryPage = (
  runtime: StdTableContract,
  descending: boolean,
  limit: number,
  startAfter?: QueryPosition,
) =>
  Effect.runPromise(
    runtime.queryItems({
      pk: 'items',
      descending,
      limit,
      ...(startAfter === undefined ? {} : { startAfter }),
    }),
  );

const indexPage = (
  runtime: StdTableContract,
  descending: boolean,
  limit: number,
  startAfter?: QueryPosition,
) =>
  Effect.runPromise(
    runtime.queryItems({
      index: 'GSI1',
      pk: 'group',
      descending,
      limit,
      ...(startAfter === undefined ? {} : { startAfter }),
    }),
  );

const sortKeys = (items: readonly EncodedItem[]) => items.map(({ sk }) => sk);

const primaryAfter = ({ pk, sk }: EncodedItem): QueryPosition => ({ pk, sk });

const indexAfter = (last: EncodedItem): QueryPosition => ({
  pk: last.pk,
  sk: last.sk,
  indexSk: last.keys['GSI1SK'] as string,
});

describe('IndexedDB physical pagination', () => {
  it('resumes primary queries after the last position in ascending order', async () => {
    const runtime = await makeRuntime();
    await write(runtime, item('a'), item('c'), item('e'));

    const first = await primaryPage(runtime, false, 2);
    expect(sortKeys(first.items)).toEqual(['a', 'c']);
    expect(first.hasMore).toBe(true);

    await Effect.runPromise(runtime.hardDeleteItem({ pk: 'items', sk: 'c' }));
    await write(runtime, item('b'), item('d'));

    const second = await primaryPage(
      runtime,
      false,
      10,
      primaryAfter(first.items.at(-1) as EncodedItem),
    );
    expect(sortKeys(second.items)).toEqual(['d', 'e']);
    expect(second.hasMore).toBe(false);
  });

  it('resumes primary queries after the last position in descending order', async () => {
    const runtime = await makeRuntime();
    await write(runtime, item('a'), item('c'), item('e'));

    const first = await primaryPage(runtime, true, 2);
    expect(sortKeys(first.items)).toEqual(['e', 'c']);
    expect(first.hasMore).toBe(true);

    await Effect.runPromise(runtime.hardDeleteItem({ pk: 'items', sk: 'c' }));
    await write(runtime, item('d'), item('b'));

    const second = await primaryPage(
      runtime,
      true,
      10,
      primaryAfter(first.items.at(-1) as EncodedItem),
    );
    expect(sortKeys(second.items)).toEqual(['b', 'a']);
    expect(second.hasMore).toBe(false);
  });

  it('resumes duplicate secondary keys by primary key in ascending order', async () => {
    const runtime = await makeRuntime(true);
    await write(
      runtime,
      item('a', 'same'),
      item('b', 'same'),
      item('c', 'same'),
      item('d', 'z'),
    );

    const first = await indexPage(runtime, false, 2);
    expect(sortKeys(first.items)).toEqual(['a', 'b']);
    expect(first.hasMore).toBe(true);

    await Effect.runPromise(runtime.hardDeleteItem({ pk: 'items', sk: 'b' }));
    await write(runtime, item('aa', 'same'), item('bb', 'same'));

    const second = await indexPage(
      runtime,
      false,
      2,
      indexAfter(first.items.at(-1) as EncodedItem),
    );
    expect(sortKeys(second.items)).toEqual(['bb', 'c']);
    expect(second.hasMore).toBe(true);

    const third = await indexPage(
      runtime,
      false,
      2,
      indexAfter(second.items.at(-1) as EncodedItem),
    );
    expect(sortKeys(third.items)).toEqual(['d']);
    expect(third.hasMore).toBe(false);
  });

  it('resumes duplicate secondary keys by primary key in descending order', async () => {
    const runtime = await makeRuntime(true);
    await write(
      runtime,
      item('a', 'same'),
      item('b', 'same'),
      item('c', 'same'),
      item('d', 'z'),
    );

    const first = await indexPage(runtime, true, 2);
    expect(sortKeys(first.items)).toEqual(['d', 'c']);
    expect(first.hasMore).toBe(true);

    await Effect.runPromise(runtime.hardDeleteItem({ pk: 'items', sk: 'c' }));
    await write(runtime, item('e', 'zz'), item('bb', 'same'));

    const second = await indexPage(
      runtime,
      true,
      10,
      indexAfter(first.items.at(-1) as EncodedItem),
    );
    expect(sortKeys(second.items)).toEqual(['bb', 'b', 'a']);
    expect(second.hasMore).toBe(false);
  });

  it('treats out-of-range positions as legal range starts', async () => {
    const runtime = await makeRuntime();
    await write(runtime, item('a'), item('b'));

    const belowRange = await primaryPage(runtime, false, 10, {
      pk: 'aaa',
      sk: 'z',
    });
    expect(sortKeys(belowRange.items)).toEqual(['a', 'b']);
    expect(belowRange.hasMore).toBe(false);

    const aboveRange = await primaryPage(runtime, false, 10, {
      pk: 'zzz',
      sk: 'a',
    });
    expect(aboveRange.items).toEqual([]);
    expect(aboveRange.hasMore).toBe(false);
  });

  it('uses the injected factory for cursor comparisons', async () => {
    const factory = indexedDB;
    const runtime = await makeRuntime(false, factory);
    await write(runtime, item('a'), item('b'));
    const first = await primaryPage(runtime, false, 1);
    Reflect.deleteProperty(globalThis, 'indexedDB');
    try {
      const second = await primaryPage(
        runtime,
        false,
        1,
        primaryAfter(first.items.at(-1) as EncodedItem),
      );
      expect(sortKeys(second.items)).toEqual(['b']);
    } finally {
      globalThis.indexedDB = factory;
    }
  });
});
