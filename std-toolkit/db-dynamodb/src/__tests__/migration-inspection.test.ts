import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';

import { DynamoEntity, DynamoTable } from '../index.js';
import { createDynamoDB } from '../services/dynamo-client.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

const TEST_TABLE_NAME = `db-dynamodb-migration-inspection-${Date.now()}`;
const LOCAL_ENDPOINT = 'http://localhost:8090';

const localConfig = {
  tableName: TEST_TABLE_NAME,
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
  endpoint: LOCAL_ENDPOINT,
};

const table = DynamoTable.make(localConfig)
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .build();

const accountSchema = EntityESchema.make('Account', 'accountId', {
  email: Schema.String,
  status: Schema.String,
}).build();

const AccountEntity = DynamoEntity.make(table)
  .eschema(accountSchema)
  .primary({ pk: ['accountId'] })
  .index('GSI1', 'byEmail', { pk: ['email'] })
  .build();

const evolvingAccountSchema = EntityESchema.make(
  'EvolvingAccount',
  'accountId',
  {
    email: Schema.String,
    status: Schema.String,
  },
)
  .evolve('v2', { plan: Schema.String }, (value) => ({
    ...value,
    plan: 'free',
  }))
  .build();

const EvolvingAccountEntity = DynamoEntity.make(table)
  .eschema(evolvingAccountSchema)
  .primary({ pk: ['accountId'] })
  .index('GSI1', 'byEmail', { pk: ['email'] })
  .build();

const optionalIndexSchema = EntityESchema.make(
  'OptionalIndexAccount',
  'accountId',
  {
    email: Schema.String,
    alias: Schema.optionalWith(Schema.String, { exact: true }),
  },
).build();

const OptionalIndexEntity = DynamoEntity.make(table)
  .eschema(optionalIndexSchema)
  .primary({ pk: ['accountId'] })
  .index('GSI1', 'byAlias', { pk: ['alias'] })
  .build();

async function createTestTable() {
  const client = createDynamoDB(localConfig);

  await Effect.runPromise(
    client
      .createTable({
        TableName: TEST_TABLE_NAME,
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
          { AttributeName: 'GSI2PK', AttributeType: 'S' },
          { AttributeName: 'GSI2SK', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
          {
            IndexName: 'GSI2',
            KeySchema: [
              { AttributeName: 'GSI2PK', KeyType: 'HASH' },
              { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      })
      .pipe(
        Effect.catchAll((e) => {
          const errorName = (e as any)?.error?.name;
          if (errorName === 'ResourceInUseException') {
            return Effect.void;
          }
          return Effect.fail(e);
        }),
      ),
  );
}

async function deleteTestTable() {
  try {
    const client = createDynamoDB(localConfig);
    await Effect.runPromise(client.deleteTable({ TableName: TEST_TABLE_NAME }));
  } catch {
    // Ignore cleanup errors.
  }
}

describe('regular entity migration inspection', () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  itEffect('inspects a normally written row as valid', () =>
    Effect.gen(function* () {
      yield* AccountEntity.insert({
        accountId: 'acct-valid',
        email: 'valid@example.com',
        status: 'active',
      });

      const { Item } = yield* table.getItem({
        pk: 'Account#acct-valid',
        sk: 'acct-valid',
      });

      const inspection = yield* AccountEntity.inspectMigration(Item!);

      expect(inspection).toEqual({
        entity: 'Account',
        state: { type: 'valid' },
        storedKey: { pk: 'Account#acct-valid', sk: 'acct-valid' },
        canonicalKey: { pk: 'Account#acct-valid', sk: 'acct-valid' },
        reasons: [],
      });
    }),
  );

  itEffect(
    'ignores a row owned by a different entity without canonical output',
    () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'Other#owned',
          sk: 'owned',
          _e: 'Other',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'owned',
          email: 'owned@example.com',
          status: 'active',
        });

        const { Item } = yield* table.getItem({
          pk: 'Other#owned',
          sk: 'owned',
        });

        const inspection = yield* AccountEntity.inspectMigration(Item!);

        expect(inspection).toEqual({
          entity: 'Account',
          state: { type: 'ignored' },
          storedKey: { pk: 'Other#owned', sk: 'owned' },
          reasons: ['entity-mismatch'],
        });
        expect(inspection).not.toHaveProperty('canonicalKey');
      }),
  );

  itEffect(
    'ignores a row missing entity ownership without canonical output',
    () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'Account#missing-owner',
          sk: 'missing-owner',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'missing-owner',
          email: 'missing-owner@example.com',
          status: 'active',
        });

        const { Item } = yield* table.getItem({
          pk: 'Account#missing-owner',
          sk: 'missing-owner',
        });

        const inspection = yield* AccountEntity.inspectMigration(Item!);

        expect(inspection).toEqual({
          entity: 'Account',
          state: { type: 'ignored' },
          storedKey: { pk: 'Account#missing-owner', sk: 'missing-owner' },
          reasons: ['entity-mismatch'],
        });
        expect(inspection).not.toHaveProperty('canonicalKey');
      }),
  );

  itEffect('inspects old schema data as stale data without index drift', () =>
    Effect.gen(function* () {
      yield* table.putItem({
        pk: 'EvolvingAccount#acct-stale-data',
        sk: 'acct-stale-data',
        GSI1PK: 'EvolvingAccount#byEmail#stale-data@example.com',
        GSI1SK: '2026-01-01T00:00:00.000Z',
        _e: 'EvolvingAccount',
        _v: 'v1',
        _u: '2026-01-01T00:00:00.000Z',
        _d: false,
        accountId: 'acct-stale-data',
        email: 'stale-data@example.com',
        status: 'active',
      });

      const { Item } = yield* table.getItem({
        pk: 'EvolvingAccount#acct-stale-data',
        sk: 'acct-stale-data',
      });

      const inspection = yield* EvolvingAccountEntity.inspectMigration(Item!);

      expect(inspection).toEqual({
        entity: 'EvolvingAccount',
        state: { type: 'stale', data: true, indexes: false },
        storedKey: {
          pk: 'EvolvingAccount#acct-stale-data',
          sk: 'acct-stale-data',
        },
        canonicalKey: {
          pk: 'EvolvingAccount#acct-stale-data',
          sk: 'acct-stale-data',
        },
        reasons: ['data-drift'],
      });
    }),
  );

  itEffect(
    'inspects missing secondary index attributes as stale indexes only',
    () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'Account#acct-missing-index',
          sk: 'acct-missing-index',
          _e: 'Account',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'acct-missing-index',
          email: 'missing-index@example.com',
          status: 'active',
        });

        const { Item } = yield* table.getItem({
          pk: 'Account#acct-missing-index',
          sk: 'acct-missing-index',
        });

        const inspection = yield* AccountEntity.inspectMigration(Item!);

        expect(inspection).toEqual({
          entity: 'Account',
          state: { type: 'stale', data: false, indexes: true },
          storedKey: {
            pk: 'Account#acct-missing-index',
            sk: 'acct-missing-index',
          },
          canonicalKey: {
            pk: 'Account#acct-missing-index',
            sk: 'acct-missing-index',
          },
          reasons: ['index-drift'],
        });
      }),
  );

  itEffect(
    'inspects mismatched secondary index attributes as stale indexes only',
    () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'Account#acct-mismatched-index',
          sk: 'acct-mismatched-index',
          GSI1PK: 'Account#byEmail#wrong@example.com',
          GSI1SK: '2026-01-01T00:00:00.000Z',
          _e: 'Account',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'acct-mismatched-index',
          email: 'mismatched-index@example.com',
          status: 'active',
        });

        const { Item } = yield* table.getItem({
          pk: 'Account#acct-mismatched-index',
          sk: 'acct-mismatched-index',
        });

        const inspection = yield* AccountEntity.inspectMigration(Item!);

        expect(inspection).toEqual({
          entity: 'Account',
          state: { type: 'stale', data: false, indexes: true },
          storedKey: {
            pk: 'Account#acct-mismatched-index',
            sk: 'acct-mismatched-index',
          },
          canonicalKey: {
            pk: 'Account#acct-mismatched-index',
            sk: 'acct-mismatched-index',
          },
          reasons: ['index-drift'],
        });
      }),
  );

  itEffect(
    'inspects data and index drift as one stale state with both flags',
    () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'EvolvingAccount#acct-both-drift',
          sk: 'acct-both-drift',
          GSI1PK: 'EvolvingAccount#byEmail#old@example.com',
          GSI1SK: '2026-01-01T00:00:00.000Z',
          _e: 'EvolvingAccount',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'acct-both-drift',
          email: 'both-drift@example.com',
          status: 'active',
        });

        const { Item } = yield* table.getItem({
          pk: 'EvolvingAccount#acct-both-drift',
          sk: 'acct-both-drift',
        });

        const inspection = yield* EvolvingAccountEntity.inspectMigration(Item!);

        expect(inspection).toEqual({
          entity: 'EvolvingAccount',
          state: { type: 'stale', data: true, indexes: true },
          storedKey: {
            pk: 'EvolvingAccount#acct-both-drift',
            sk: 'acct-both-drift',
          },
          canonicalKey: {
            pk: 'EvolvingAccount#acct-both-drift',
            sk: 'acct-both-drift',
          },
          reasons: ['data-drift', 'index-drift'],
        });
      }),
  );

  itEffect('inspects an entity-owned row missing _u as corrupt', () =>
    Effect.gen(function* () {
      yield* table.putItem({
        pk: 'Account#acct-missing-u',
        sk: 'acct-missing-u',
        GSI1PK: 'Account#byEmail#missing-u@example.com',
        _e: 'Account',
        _v: 'v1',
        _d: false,
        accountId: 'acct-missing-u',
        email: 'missing-u@example.com',
        status: 'active',
      });

      const { Item } = yield* table.getItem({
        pk: 'Account#acct-missing-u',
        sk: 'acct-missing-u',
      });

      const inspection = yield* AccountEntity.inspectMigration(Item!);

      expect(inspection).toEqual({
        entity: 'Account',
        state: { type: 'corrupt' },
        storedKey: { pk: 'Account#acct-missing-u', sk: 'acct-missing-u' },
        reasons: ['missing-_u'],
      });
      expect(inspection).not.toHaveProperty('canonicalKey');
    }),
  );

  itEffect('inspects an entity-owned row missing _d as stale data', () =>
    Effect.gen(function* () {
      yield* table.putItem({
        pk: 'Account#acct-missing-d',
        sk: 'acct-missing-d',
        GSI1PK: 'Account#byEmail#missing-d@example.com',
        GSI1SK: '2026-01-01T00:00:00.000Z',
        _e: 'Account',
        _v: 'v1',
        _u: '2026-01-01T00:00:00.000Z',
        accountId: 'acct-missing-d',
        email: 'missing-d@example.com',
        status: 'active',
      });

      const { Item } = yield* table.getItem({
        pk: 'Account#acct-missing-d',
        sk: 'acct-missing-d',
      });

      const inspection = yield* AccountEntity.inspectMigration(Item!);

      expect(inspection).toEqual({
        entity: 'Account',
        state: { type: 'stale', data: true, indexes: false },
        storedKey: { pk: 'Account#acct-missing-d', sk: 'acct-missing-d' },
        canonicalKey: { pk: 'Account#acct-missing-d', sk: 'acct-missing-d' },
        reasons: ['data-drift'],
      });
    }),
  );

  itEffect('inspects schema decode failures as corrupt', () =>
    Effect.gen(function* () {
      yield* table.putItem({
        pk: 'Account#acct-bad-version',
        sk: 'acct-bad-version',
        GSI1PK: 'Account#byEmail#bad-version@example.com',
        GSI1SK: '2026-01-01T00:00:00.000Z',
        _e: 'Account',
        _v: 'v99',
        _u: '2026-01-01T00:00:00.000Z',
        _d: false,
        accountId: 'acct-bad-version',
        email: 'bad-version@example.com',
        status: 'active',
      });

      const { Item } = yield* table.getItem({
        pk: 'Account#acct-bad-version',
        sk: 'acct-bad-version',
      });

      const inspection = yield* AccountEntity.inspectMigration(Item!);

      expect(inspection).toEqual({
        entity: 'Account',
        state: { type: 'corrupt' },
        storedKey: {
          pk: 'Account#acct-bad-version',
          sk: 'acct-bad-version',
        },
        reasons: ['decode-failed'],
      });
      expect(inspection).not.toHaveProperty('canonicalKey');
    }),
  );

  itEffect(
    'inspects current derivation changing the table key as primaryKeyChanged',
    () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'Account#old-primary',
          sk: 'old-primary',
          GSI1PK: 'Account#byEmail#primary-changed@example.com',
          GSI1SK: '2026-01-01T00:00:00.000Z',
          _e: 'Account',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'acct-primary-changed',
          email: 'primary-changed@example.com',
          status: 'active',
        });

        const { Item } = yield* table.getItem({
          pk: 'Account#old-primary',
          sk: 'old-primary',
        });

        const inspection = yield* AccountEntity.inspectMigration(Item!);

        expect(inspection).toEqual({
          entity: 'Account',
          state: { type: 'primaryKeyChanged' },
          storedKey: { pk: 'Account#old-primary', sk: 'old-primary' },
          canonicalKey: {
            pk: 'Account#acct-primary-changed',
            sk: 'acct-primary-changed',
          },
          reasons: ['primary-key-changed'],
        });
      }),
  );

  itEffect(
    'treats omitted secondary index attributes from missing dependencies as valid',
    () =>
      Effect.gen(function* () {
        yield* OptionalIndexEntity.insert({
          accountId: 'acct-no-alias',
          email: 'no-alias@example.com',
        });

        const { Item } = yield* table.getItem({
          pk: 'OptionalIndexAccount#acct-no-alias',
          sk: 'acct-no-alias',
        });

        expect(Item).not.toHaveProperty('GSI1PK');
        expect(Item).toHaveProperty('GSI1SK');

        const inspection = yield* OptionalIndexEntity.inspectMigration(Item!);

        expect(inspection).toEqual({
          entity: 'OptionalIndexAccount',
          state: { type: 'valid' },
          storedKey: {
            pk: 'OptionalIndexAccount#acct-no-alias',
            sk: 'acct-no-alias',
          },
          canonicalKey: {
            pk: 'OptionalIndexAccount#acct-no-alias',
            sk: 'acct-no-alias',
          },
          reasons: [],
        });
      }),
  );

  itEffect(
    'inspects obsolete secondary index attributes as stale indexes only',
    () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'Account#acct-obsolete-index',
          sk: 'acct-obsolete-index',
          GSI1PK: 'Account#byEmail#obsolete-index@example.com',
          GSI1SK: '2026-01-01T00:00:00.000Z',
          GSI2PK: 'Account#oldIndex#obsolete-index@example.com',
          GSI2SK: 'obsolete-index',
          _e: 'Account',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'acct-obsolete-index',
          email: 'obsolete-index@example.com',
          status: 'active',
        });

        const { Item } = yield* table.getItem({
          pk: 'Account#acct-obsolete-index',
          sk: 'acct-obsolete-index',
        });

        const inspection = yield* AccountEntity.inspectMigration(Item!);

        expect(inspection).toEqual({
          entity: 'Account',
          state: { type: 'stale', data: false, indexes: true },
          storedKey: {
            pk: 'Account#acct-obsolete-index',
            sk: 'acct-obsolete-index',
          },
          canonicalKey: {
            pk: 'Account#acct-obsolete-index',
            sk: 'acct-obsolete-index',
          },
          reasons: ['index-drift'],
        });
      }),
  );

  itEffect(
    'inspects unknown persisted non-index attributes as stale data',
    () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'Account#acct-extra-data',
          sk: 'acct-extra-data',
          GSI1PK: 'Account#byEmail#extra-data@example.com',
          GSI1SK: '2026-01-01T00:00:00.000Z',
          _e: 'Account',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'acct-extra-data',
          email: 'extra-data@example.com',
          status: 'active',
          legacyField: 'remove-me',
        });

        const { Item } = yield* table.getItem({
          pk: 'Account#acct-extra-data',
          sk: 'acct-extra-data',
        });

        const inspection = yield* AccountEntity.inspectMigration(Item!);

        expect(inspection).toEqual({
          entity: 'Account',
          state: { type: 'stale', data: true, indexes: false },
          storedKey: { pk: 'Account#acct-extra-data', sk: 'acct-extra-data' },
          canonicalKey: {
            pk: 'Account#acct-extra-data',
            sk: 'acct-extra-data',
          },
          reasons: ['data-drift'],
        });
      }),
  );
});
