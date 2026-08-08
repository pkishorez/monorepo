import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { DynamoDB, DynamoTable } from '../index.js';
import type { DynamoDBClient } from '../clients/dynamodb-client/index.js';

const client = (account: string) => ({ account }) as unknown as DynamoDBClient;

describe('DynamoDB bindings', () => {
  it('resolves tables bound to different clients', async () => {
    const users = DynamoTable.make('users').primary('pk', 'sk').build();
    const audit = DynamoTable.make('audit').primary('pk', 'sk').build();
    const usersClient = client('account-one');
    const auditClient = client('account-two');
    const layer = DynamoDB.layer(
      { table: users, client: usersClient, tableName: 'users-production' },
      { table: audit, client: auditClient, tableName: 'audit-production' },
    );

    const resolved = await Effect.runPromise(
      Effect.all([DynamoDB.resolve(users), DynamoDB.resolve(audit)]).pipe(
        Effect.provide(layer),
      ),
    );

    expect(resolved).toEqual([
      { client: usersClient, tableName: 'users-production' },
      { client: auditClient, tableName: 'audit-production' },
    ]);
  });

  it('fails with the missing logical table identity', async () => {
    const bound = DynamoTable.make('bound').primary('pk', 'sk').build();
    const missing = DynamoTable.make('missing').primary('pk', 'sk').build();
    const layer = DynamoDB.layer({
      table: bound,
      client: client('account-one'),
      tableName: 'bound-production',
    });

    const error = await Effect.runPromise(
      DynamoDB.resolve(missing).pipe(Effect.provide(layer), Effect.flip),
    );

    expect(error._tag).toBe('TableBindingNotFound');
    expect(error.table.logicalName).toBe('missing');
  });

  it('rejects duplicate bindings for the same table object', () => {
    const users = DynamoTable.make('users').primary('pk', 'sk').build();

    expect(() =>
      DynamoDB.layer(
        { table: users, client: client('one'), tableName: 'users-one' },
        { table: users, client: client('two'), tableName: 'users-two' },
      ),
    ).toThrow('has more than one DynamoDB binding');
  });
});
