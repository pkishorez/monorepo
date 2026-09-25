import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../index.js';
import type { DynamoDBClient } from '../client/index.js';
import { ensureDynamoTable } from '../setup/index.js';

const table = StdTable.make('people')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const activeClient = (
  createTable: (input: unknown) => Effect.Effect<unknown, unknown>,
) =>
  ({
    createTable,
    describeTable: () => Effect.succeed({ Table: { TableStatus: 'ACTIVE' } }),
  }) as unknown as DynamoDBClient;

describe('DynamoDB setup', () => {
  it('creates a missing table with the projected topology', async () => {
    const requests: unknown[] = [];
    const client = activeClient((input) => {
      requests.push(input);
      return Effect.succeed({});
    });

    await Effect.runPromise(ensureDynamoTable(client, table, 'people-table'));

    expect(requests).toEqual([
      expect.objectContaining({
        TableName: 'people-table',
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
      }),
    ]);
  });

  it('leaves an existing table as it is', async () => {
    const client = activeClient(() =>
      Effect.fail({ _tag: 'ResourceInUseException' }),
    );

    await expect(
      Effect.runPromise(ensureDynamoTable(client, table, 'people-table')),
    ).resolves.toBeUndefined();
  });

  it('waits until the table is ACTIVE before returning', async () => {
    let described = 0;
    const client = {
      createTable: () => Effect.succeed({}),
      describeTable: () =>
        Effect.sync(() => ({
          Table: { TableStatus: ++described < 3 ? 'CREATING' : 'ACTIVE' },
        })),
    } as unknown as DynamoDBClient;

    await Effect.runPromise(ensureDynamoTable(client, table, 'people-table'));

    expect(described).toBe(3);
  });

  it('retains a setup failure cause', async () => {
    const cause = new Error('denied');
    const client = activeClient(() => Effect.fail(cause));

    const result = await Effect.runPromise(
      ensureDynamoTable(client, table, 'people-table').pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { operation: 'setup', cause },
    });
  });
});
