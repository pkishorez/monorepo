import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { QueryRequest } from '../../../std-table/contract/index.js';
import { readStoredSnapshot } from '../../../table-snapshot/index.js';
import type { GetItemInput, QueryInput } from '../../client/generated/types.js';
import type { DynamoDBClient } from '../../client/index.js';
import { makeTableContract } from '../table.js';

const table = {
  primary: { pk: 'PK', sk: 'SK' },
  localSecondaryIndexes: {
    lsi1: { name: 'lsi1', kind: 'lsi', pk: 'PK', sk: 'LSK' },
  },
  globalSecondaryIndexes: {
    gsi1: { name: 'gsi1', kind: 'gsi', pk: 'GPK', sk: 'GSK' },
  },
} as const;

const capturingClient = (
  capture: (input: QueryInput) => void,
  result: { Items?: unknown[]; LastEvaluatedKey?: unknown } = { Items: [] },
) =>
  new Proxy({} as DynamoDBClient, {
    get: (_target, property) =>
      property === 'query'
        ? (query: QueryInput) => {
            capture(query);
            return Effect.succeed(result);
          }
        : undefined,
  });

const request = (sort: QueryRequest['sort']): QueryRequest => ({
  pk: 'person',
  ...(sort === undefined ? {} : { sort }),
  descending: false,
  limit: 10,
});

describe('DynamoDB runtime query', () => {
  it.each([
    [undefined, '#k_attr_1 = :k_value_2'],
    [
      { operator: '=', value: 'a' },
      '#k_attr_1 = :k_value_2 AND #k_attr_3 = :k_value_4',
    ],
    [
      { operator: '<', value: 'a' },
      '#k_attr_1 = :k_value_2 AND #k_attr_3 < :k_value_4',
    ],
    [
      { operator: '<=', value: 'a' },
      '#k_attr_1 = :k_value_2 AND #k_attr_3 <= :k_value_4',
    ],
    [
      { operator: '>', value: 'a' },
      '#k_attr_1 = :k_value_2 AND #k_attr_3 > :k_value_4',
    ],
    [
      { operator: '>=', value: 'a' },
      '#k_attr_1 = :k_value_2 AND #k_attr_3 >= :k_value_4',
    ],
    [
      { operator: 'between', value: ['a', 'z'] },
      '#k_attr_1 = :k_value_2 AND #k_attr_3 BETWEEN :k_value_4 AND :k_value_5',
    ],
    [
      { operator: 'beginsWith', value: 'prefix' },
      '#k_attr_1 = :k_value_2 AND begins_with(#k_attr_3, :k_value_4)',
    ],
  ] as const)('compiles the %j sort condition', async (sort, expected) => {
    let input: QueryInput | undefined;
    const client = new Proxy({} as DynamoDBClient, {
      get: (_target, property) =>
        property === 'query'
          ? (query: QueryInput) => {
              input = query;
              return Effect.succeed({ Items: [] });
            }
          : undefined,
    });
    const runtime = makeTableContract(client, table, 'people');

    await Effect.runPromise(runtime.queryItems(request(sort)));

    expect(input).toMatchObject({
      TableName: 'people',
      KeyConditionExpression: expected,
      ExpressionAttributeNames: {
        '#k_attr_1': 'PK',
        ...(sort === undefined ? {} : { '#k_attr_3': 'SK' }),
      },
      ScanIndexForward: true,
      Limit: 10,
    });
  });

  it('omits ExclusiveStartKey without startAfter', async () => {
    let input: QueryInput | undefined;
    const runtime = makeTableContract(
      capturingClient((query) => (input = query)),
      table,
      'people',
    );

    const result = await Effect.runPromise(
      runtime.queryItems(request(undefined)),
    );

    expect(input).not.toHaveProperty('ExclusiveStartKey');
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it('translates startAfter for a primary query', async () => {
    let input: QueryInput | undefined;
    const runtime = makeTableContract(
      capturingClient((query) => (input = query)),
      table,
      'people',
    );

    await Effect.runPromise(
      runtime.queryItems({
        ...request(undefined),
        startAfter: { pk: 'person', sk: 'a' },
      }),
    );

    expect(input?.ExclusiveStartKey).toEqual({
      PK: { S: 'person' },
      SK: { S: 'a' },
    });
  });

  it('translates startAfter for an LSI query', async () => {
    let input: QueryInput | undefined;
    const runtime = makeTableContract(
      capturingClient((query) => (input = query)),
      table,
      'people',
    );

    await Effect.runPromise(
      runtime.queryItems({
        ...request(undefined),
        index: 'lsi1',
        startAfter: { pk: 'person', sk: 'a', indexSk: 'x' },
      }),
    );

    expect(input?.ExclusiveStartKey).toEqual({
      PK: { S: 'person' },
      SK: { S: 'a' },
      LSK: { S: 'x' },
    });
  });

  it('translates startAfter for a GSI query', async () => {
    let input: QueryInput | undefined;
    const runtime = makeTableContract(
      capturingClient((query) => (input = query)),
      table,
      'people',
    );

    await Effect.runPromise(
      runtime.queryItems({
        ...request(undefined),
        index: 'gsi1',
        pk: 'owner',
        startAfter: { pk: 'person', sk: 'a', indexSk: 'x' },
      }),
    );

    expect(input?.ExclusiveStartKey).toEqual({
      GPK: { S: 'owner' },
      GSK: { S: 'x' },
      PK: { S: 'person' },
      SK: { S: 'a' },
    });
  });

  it('fails an index query missing indexSk', async () => {
    const runtime = makeTableContract(
      capturingClient(() => {}),
      table,
      'people',
    );

    const exit = await Effect.runPromiseExit(
      runtime.queryItems({
        ...request(undefined),
        index: 'gsi1',
        startAfter: { pk: 'person', sk: 'a' },
      }),
    );

    expect(exit._tag).toBe('Failure');
  });

  it('reports hasMore from LastEvaluatedKey', async () => {
    const runtime = makeTableContract(
      capturingClient(() => {}, {
        Items: [],
        LastEvaluatedKey: { PK: { S: 'person' }, SK: { S: 'a' } },
      }),
      table,
      'people',
    );

    const result = await Effect.runPromise(
      runtime.queryItems(request(undefined)),
    );

    expect(result).toEqual({ items: [], hasMore: true });
  });

  it('treats an empty LastEvaluatedKey as the final page', async () => {
    const runtime = makeTableContract(
      capturingClient(() => {}, { Items: [], LastEvaluatedKey: {} }),
      table,
      'people',
    );

    const result = await Effect.runPromise(
      runtime.queryItems(request(undefined)),
    );

    expect(result).toEqual({ items: [], hasMore: false });
  });

  describe('a consistent query', () => {
    const consistently = async (
      query: QueryRequest,
    ): Promise<QueryInput | undefined> => {
      let input: QueryInput | undefined;
      const runtime = makeTableContract(
        capturingClient((sent) => (input = sent)),
        table,
        'people',
      );
      await Effect.runPromise(runtime.queryItems(query));
      return input;
    };

    it('asks for ConsistentRead on the table and a local secondary index', async () => {
      expect(
        (await consistently({ ...request(undefined), consistent: true }))
          ?.ConsistentRead,
      ).toBe(true);
      expect(
        (
          await consistently({
            ...request(undefined),
            index: 'lsi1',
            consistent: true,
          })
        )?.ConsistentRead,
      ).toBe(true);
      expect(await consistently(request(undefined))).not.toHaveProperty(
        'ConsistentRead',
      );
    });

    it('is refused on a global secondary index, which has none', async () => {
      let sent = false;
      const runtime = makeTableContract(
        capturingClient(() => (sent = true)),
        table,
        'people',
      );
      const exit = await Effect.runPromiseExit(
        runtime.queryItems({
          ...request(undefined),
          index: 'gsi1',
          consistent: true,
        }),
      );
      expect(exit._tag).toBe('Failure');
      expect(sent).toBe(false);
    });

    it('is how the stored snapshot is read', async () => {
      const queries: QueryInput[] = [];
      const gets: GetItemInput[] = [];
      const client = new Proxy({} as DynamoDBClient, {
        get: (_target, property) =>
          property === 'query'
            ? (query: QueryInput) => {
                queries.push(query);
                return Effect.succeed({ Items: [] });
              }
            : property === 'getItem'
              ? (get: GetItemInput) => {
                  gets.push(get);
                  return Effect.succeed({});
                }
              : undefined,
      });
      await Effect.runPromise(
        readStoredSnapshot(makeTableContract(client, table, 'people')),
      );
      expect(queries).toHaveLength(2);
      for (const query of queries) expect(query.ConsistentRead).toBe(true);
      expect(gets.map(({ ConsistentRead }) => ConsistentRead)).toEqual([true]);
    });
  });
});
