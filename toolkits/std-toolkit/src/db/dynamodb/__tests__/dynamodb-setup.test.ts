import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../index.js';
import type { DynamoDBClient } from '../client/index.js';
import { setupDynamoTable } from '../setup/index.js';

const table = StdTable.make('people')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

describe('DynamoDB setup', () => {
  it('creates a missing table with the projected topology', async () => {
    const requests: unknown[] = [];
    const client = {
      createTable: (input: unknown) => {
        requests.push(input);
        return Effect.succeed({});
      },
    } as unknown as DynamoDBClient;

    await Effect.runPromise(setupDynamoTable(client, table, 'people-table'));

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

  it('fails when the table already exists', async () => {
    const cause = { _tag: 'ResourceInUseException' };
    const client = {
      createTable: () => Effect.fail(cause),
    } as unknown as DynamoDBClient;

    const result = await Effect.runPromise(
      setupDynamoTable(client, table, 'people-table').pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { operation: 'setup', cause },
    });
  });

  it('retains a setup failure cause', async () => {
    const cause = new Error('denied');
    const client = {
      createTable: () => Effect.fail(cause),
    } as unknown as DynamoDBClient;

    const result = await Effect.runPromise(
      setupDynamoTable(client, table, 'people-table').pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { operation: 'setup', cause },
    });
  });
});
