import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type {
  EncodedItem,
  QueryPosition,
  StdTableContract,
} from '../../std-table/contract/index.js';
import { makeTableContract } from '../table/index.js';

const table = {
  localSecondaryIndexes: {},
  globalSecondaryIndexes: {
    GSI1: { name: 'GSI1', kind: 'gsi' as const, pk: 'GSI1PK', sk: 'GSI1SK' },
  },
};

const item = (sk: string, indexSort?: string): EncodedItem => ({
  pk: 'items',
  sk,
  meta: { _e: 'Item', _v: 'v1', _u: sk, _d: false },
  data: { sk },
  keys: indexSort === undefined ? {} : { GSI1PK: 'group', GSI1SK: indexSort },
});

const makeContract = () => makeTableContract(table, new Map());

const write = async (
  contract: StdTableContract,
  ...items: readonly EncodedItem[]
) => {
  for (const stored of items)
    await Effect.runPromise(contract.writeItem({ item: stored }));
};

const page = (
  contract: StdTableContract,
  descending: boolean,
  limit: number,
  startAfter?: QueryPosition,
  indexed = false,
) =>
  Effect.runPromise(
    contract.queryItems({
      ...(indexed ? { index: 'GSI1', pk: 'group' } : { pk: 'items' }),
      descending,
      limit,
      ...(startAfter === undefined ? {} : { startAfter }),
    }),
  );

const sortKeys = (items: readonly EncodedItem[]) => items.map(({ sk }) => sk);

describe('Memory pagination', () => {
  it('resumes by ordered position after the previous item is deleted', async () => {
    const contract = makeContract();
    await write(contract, item('a'), item('c'), item('e'));
    const first = await page(contract, false, 2);

    await Effect.runPromise(contract.hardDeleteItem({ pk: 'items', sk: 'c' }));
    await write(contract, item('b'), item('d'));
    const second = await page(contract, false, 10, {
      pk: 'items',
      sk: 'c',
    });

    expect(sortKeys(first.items)).toEqual(['a', 'c']);
    expect(first.hasMore).toBe(true);
    expect(sortKeys(second.items)).toEqual(['d', 'e']);
  });

  it('resumes duplicate index sort keys by primary key', async () => {
    const contract = makeContract();
    await write(
      contract,
      item('a', 'same'),
      item('b', 'same'),
      item('c', 'same'),
      item('d', 'z'),
    );
    const first = await page(contract, false, 2, undefined, true);

    await Effect.runPromise(contract.hardDeleteItem({ pk: 'items', sk: 'b' }));
    await write(contract, item('aa', 'same'), item('bb', 'same'));
    const second = await page(
      contract,
      false,
      10,
      { pk: 'items', sk: 'b', indexSk: 'same' },
      true,
    );

    expect(sortKeys(first.items)).toEqual(['a', 'b']);
    expect(sortKeys(second.items)).toEqual(['bb', 'c', 'd']);
  });

  it('resumes descending queries by ordered position', async () => {
    const contract = makeContract();
    await write(contract, item('a'), item('c'), item('e'));
    const first = await page(contract, true, 2);

    await Effect.runPromise(contract.hardDeleteItem({ pk: 'items', sk: 'c' }));
    await write(contract, item('b'), item('d'));
    const second = await page(contract, true, 10, {
      pk: 'items',
      sk: 'c',
    });

    expect(sortKeys(first.items)).toEqual(['e', 'c']);
    expect(sortKeys(second.items)).toEqual(['b', 'a']);
  });
});
