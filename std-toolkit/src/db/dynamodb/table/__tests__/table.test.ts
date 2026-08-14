import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../../index.js';
import type { DynamoDBClient } from '../../client/index.js';
import { makeTableContract } from '../table.js';

describe('DynamoDB runtime', () => {
  it('reports malformed stored data as a runtime failure', async () => {
    const table = StdTable.make('items').primary('pk', 'sk').build();
    const client = {
      getItem: () =>
        Effect.succeed({ Item: { pk: { S: 'p' }, sk: { S: 's' } } }),
    } as unknown as DynamoDBClient;
    const runtime = makeTableContract(client, table, 'items');

    const result = await Effect.runPromise(
      runtime.getItem({ pk: 'p', sk: 's' }).pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'OperationFailure' },
    });
  });
});
