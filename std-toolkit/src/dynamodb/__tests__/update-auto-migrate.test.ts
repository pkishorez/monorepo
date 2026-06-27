import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const itEffect = <A, E>(
  name: string,
  fn: () => Effect.Effect<A, E, DynamoDB>,
) =>
  it(name, () =>
    Effect.runPromise(fn().pipe(Effect.provide(dynamoDBLayer(localConfig)))),
  );
import { Effect, Schema } from 'effect';
import { EntityESchema } from '../../eschema/index.js';
import { DynamoTable, DynamoEntity, DynamodbError } from '../index.js';
import {
  createDynamoDB,
  dynamoDBLayer,
  DynamoDB,
} from '../services/dynamo-client.js';

const TEST_TABLE_NAME = `db-dynamodb-auto-migrate-test-${Date.now()}`;
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

const table = DynamoTable.make().primary('pk', 'sk').build();

const settingsSchemaV1 = EntityESchema.make('Settings', 'settingsId', {
  theme: Schema.String,
}).build();

const settingsSchemaV2 = EntityESchema.make('Settings', 'settingsId', {
  theme: Schema.String,
})
  .evolve('v2', { fontSize: Schema.Number }, (prev) => ({
    ...prev,
    fontSize: 14,
  }))
  .build();

const SettingsV1 = DynamoEntity.make(table)
  .eschema(settingsSchemaV1)
  .primary({ pk: ['settingsId'] })
  .build();

const SettingsV2 = DynamoEntity.make(table)
  .eschema(settingsSchemaV2)
  .primary({ pk: ['settingsId'] })
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
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      })
      .pipe(
        Effect.catch((e) => {
          const errorName = (e as any)?.error?.name;
          if (errorName === 'ResourceInUseException') return Effect.void;
          return Effect.fail(e);
        }),
      ),
  );
}

async function deleteTestTable() {
  try {
    const client = createDynamoDB(localConfig);
    await Effect.runPromise(client.deleteTable({ TableName: TEST_TABLE_NAME }));
  } catch {}
}

describe('update auto-migrate', () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  describe('non-existent item', () => {
    itEffect('throws NoItemToUpdate when item does not exist', () =>
      Effect.gen(function* () {
        const error = yield* SettingsV2.update(
          { settingsId: 'does-not-exist' },
          { update: { theme: 'dark' } },
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe('NoItemToUpdate');
      }),
    );
  });

  describe('latest version item', () => {
    itEffect('updates successfully when item is on latest version', () =>
      Effect.gen(function* () {
        yield* SettingsV2.insert({
          settingsId: 'latest-item',
          theme: 'light',
          fontSize: 16,
        });

        const result = yield* SettingsV2.update(
          { settingsId: 'latest-item' },
          { update: { theme: 'dark' } },
        );

        expect(result.value.theme).toBe('dark');
        expect(result.value.fontSize).toBe(16);
      }),
    );

    itEffect(
      'throws ConditionCheckFailed when user condition fails on latest item',
      () =>
        Effect.gen(function* () {
          yield* SettingsV2.insert({
            settingsId: 'condition-fail-item',
            theme: 'light',
            fontSize: 14,
          });

          const error = yield* SettingsV2.update(
            { settingsId: 'condition-fail-item' },
            {
              update: { theme: 'dark' },
              condition: ($) => $.cond('theme', '=', 'nonexistent'),
            },
          ).pipe(Effect.flip);

          expect(error).toBeInstanceOf(DynamodbError);
          expect(error.error._tag).toBe('ConditionCheckFailed');
        }),
    );
  });

  describe('stale version item with autoMigrate (default)', () => {
    itEffect('auto-migrates a v1 item to v2 and applies the update', () =>
      Effect.gen(function* () {
        // Insert a v1 item directly using the v1 entity
        yield* SettingsV1.insert({
          settingsId: 'stale-auto-migrate',
          theme: 'light',
        });

        // Now update using v2 entity — item is on v1, should auto-migrate
        const result = yield* SettingsV2.update(
          { settingsId: 'stale-auto-migrate' },
          { update: { theme: 'dark' } },
        );

        expect(result.value.theme).toBe('dark');
        expect(result.value.fontSize).toBe(14);
        expect(result.meta._v).toBe('v2');
      }),
    );

    itEffect('auto-migrates a v1 item even when the user condition fails', () =>
      Effect.gen(function* () {
        yield* SettingsV1.insert({
          settingsId: 'stale-condition-fail',
          theme: 'light',
        });

        const error = yield* SettingsV2.update(
          { settingsId: 'stale-condition-fail' },
          {
            update: { theme: 'dark' },
            condition: ($) => $.cond('theme', '=', 'nonexistent'),
          },
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe('ConditionCheckFailed');

        const migrated = yield* SettingsV2.get({
          settingsId: 'stale-condition-fail',
        });
        if (!migrated) throw new Error('Expected migrated item to exist');

        expect(migrated.value.theme).toBe('light');
        expect(migrated.value.fontSize).toBe(14);
        expect(migrated.meta._v).toBe('v2');
      }),
    );
  });

  describe('stale version item with autoMigrate: false', () => {
    itEffect('throws ItemVersionMismatch when item is on old version', () =>
      Effect.gen(function* () {
        yield* SettingsV1.insert({
          settingsId: 'stale-no-migrate',
          theme: 'light',
        });

        const error = yield* SettingsV2.update(
          { settingsId: 'stale-no-migrate' },
          {
            update: { theme: 'dark' },
            autoMigrate: false,
          },
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe('ItemVersionMismatch');
      }),
    );
  });
});
