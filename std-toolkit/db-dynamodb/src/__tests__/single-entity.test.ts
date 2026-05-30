import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Schema } from 'effect';
import { SingleEntityESchema } from '@std-toolkit/eschema';
import { DynamoTable, DynamoSingleEntity } from '../index.js';
import { createDynamoDB } from '../services/dynamo-client.js';

const TEST_TABLE_NAME = `db-dynamodb-single-entity-test-${Date.now()}`;
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

const table = DynamoTable.make(localConfig).primary('pk', 'sk').build();

const configSchema = SingleEntityESchema.make('AppConfig', {
  theme: Schema.String,
  maxRetries: Schema.Number,
}).build();

const AppConfig = DynamoSingleEntity.make(table)
  .eschema(configSchema)
  .default({ theme: 'light', maxRetries: 3 });

async function createTestTable() {
  const client = createDynamoDB(localConfig);

  const createParams = {
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
  };

  await Effect.runPromise(
    client.createTable(createParams).pipe(
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
    // Ignore cleanup errors
  }
}

describe('DynamoSingleEntity', () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  describe('get', () => {
    itEffect('returns default when item is absent', () =>
      Effect.gen(function* () {
        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe('light');
        expect(result.value.maxRetries).toBe(3);
        expect(result.meta._u).toBe('');
        expect(result.meta._e).toBe('AppConfig');
      }),
    );

    itEffect('returns stored item after put', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({
          theme: 'dark',
          maxRetries: 5,
        });

        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe('dark');
        expect(result.value.maxRetries).toBe(5);
        expect(result.meta._u).not.toBe('');
        expect(result.meta._e).toBe('AppConfig');
      }),
    );
  });

  describe('put', () => {
    itEffect('writes unconditionally', () =>
      Effect.gen(function* () {
        const result = yield* AppConfig.put({
          theme: 'blue',
          maxRetries: 10,
        });

        expect(result.value.theme).toBe('blue');
        expect(result.value.maxRetries).toBe(10);
        expect(result.meta._u).not.toBe('');
      }),
    );

    itEffect('overwrites existing item', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({
          theme: 'red',
          maxRetries: 1,
        });

        yield* AppConfig.put({
          theme: 'green',
          maxRetries: 99,
        });

        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe('green');
        expect(result.value.maxRetries).toBe(99);
      }),
    );
  });

  describe('update', () => {
    itEffect('updates with plain object patch', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({
          theme: 'light',
          maxRetries: 3,
        });

        const result = yield* AppConfig.update({
          update: { theme: 'dark' },
        });

        expect(result.value.theme).toBe('dark');
        expect(result.value.maxRetries).toBe(3);
      }),
    );

    itEffect('updates with expression builder (opAdd)', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({
          theme: 'light',
          maxRetries: 3,
        });

        const result = yield* AppConfig.update({
          update: ($) => [$.set('maxRetries', $.opAdd('maxRetries', 1))],
        });

        expect(result.value.maxRetries).toBe(4);
      }),
    );

    itEffect('fails with NoItemToUpdate on non-existent item', () =>
      Effect.gen(function* () {
        const emptySchema = SingleEntityESchema.make('EmptyConfig', {
          value: Schema.String,
        }).build();

        const EmptyConfig = DynamoSingleEntity.make(table)
          .eschema(emptySchema)
          .default({ value: 'x' });

        const error = yield* EmptyConfig.update({
          update: { value: 'y' },
        }).pipe(Effect.flip);

        expect(error.error._tag).toBe('NoItemToUpdate');
      }),
    );
  });

  describe('inspectMigration', () => {
    itEffect('reports a stored current row as valid', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({
          theme: 'dark',
          maxRetries: 5,
        });

        const { Item } = yield* table.getItem(
          { pk: 'AppConfig', sk: 'AppConfig' },
          { ConsistentRead: true },
        );

        expect(Item).not.toBeNull();
        const inspection = yield* AppConfig.inspectMigration(Item!);

        expect(inspection).toMatchObject({
          entity: 'AppConfig',
          state: { type: 'valid' },
          reasons: [],
        });
      }),
    );

    itEffect('reports stale schema data without secondary index issues', () =>
      Effect.gen(function* () {
        const evolvedSchema = SingleEntityESchema.make('EvolvedConfig', {
          theme: Schema.String,
        })
          .evolve('v2', { maxRetries: Schema.Number }, (value) => ({
            ...value,
            maxRetries: 3,
          }))
          .build();

        const EvolvedConfig = DynamoSingleEntity.make(table)
          .eschema(evolvedSchema)
          .default({ theme: 'light', maxRetries: 3 });

        yield* table.putItem({
          pk: 'EvolvedConfig',
          sk: 'EvolvedConfig',
          _e: 'EvolvedConfig',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          theme: 'dark',
        });

        const { Item } = yield* table.getItem(
          { pk: 'EvolvedConfig', sk: 'EvolvedConfig' },
          { ConsistentRead: true },
        );

        expect(Item).not.toBeNull();
        const inspection = yield* EvolvedConfig.inspectMigration(Item!);

        expect(inspection.state).toEqual({
          type: 'stale',
          data: true,
          indexes: false,
        });
        expect(Object.keys(inspection).sort()).toEqual([
          'entity',
          'reasons',
          'state',
        ]);

        const { Item: storedAfterInspection } = yield* table.getItem(
          { pk: 'EvolvedConfig', sk: 'EvolvedConfig' },
          { ConsistentRead: true },
        );
        expect(storedAfterInspection).toEqual(Item);
      }),
    );

    itEffect('reports stale single-entity metadata as stale data', () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'AppConfig',
          sk: 'AppConfig',
          _e: 'OldAppConfig',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          theme: 'dark',
          maxRetries: 5,
        });

        const { Item } = yield* table.getItem(
          { pk: 'AppConfig', sk: 'AppConfig' },
          { ConsistentRead: true },
        );

        expect(Item).not.toBeNull();
        const inspection = yield* AppConfig.inspectMigration(Item!);

        expect(inspection.state).toEqual({
          type: 'stale',
          data: true,
          indexes: false,
        });
      }),
    );

    itEffect('reports missing _u as corrupt', () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'MissingUpdateConfig',
          sk: 'MissingUpdateConfig',
          _e: 'MissingUpdateConfig',
          _v: 'v1',
          theme: 'dark',
          maxRetries: 5,
        });

        const missingUpdateSchema = SingleEntityESchema.make(
          'MissingUpdateConfig',
          {
            theme: Schema.String,
            maxRetries: Schema.Number,
          },
        ).build();

        const MissingUpdateConfig = DynamoSingleEntity.make(table)
          .eschema(missingUpdateSchema)
          .default({ theme: 'light', maxRetries: 3 });

        const { Item } = yield* table.getItem(
          { pk: 'MissingUpdateConfig', sk: 'MissingUpdateConfig' },
          { ConsistentRead: true },
        );

        expect(Item).not.toBeNull();
        const inspection = yield* MissingUpdateConfig.inspectMigration(Item!);

        expect(inspection.state).toEqual({ type: 'corrupt' });
      }),
    );

    itEffect('reports schema decode failures as corrupt', () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'BrokenConfig',
          sk: 'BrokenConfig',
          _e: 'BrokenConfig',
          _v: 'v99',
          _u: '2026-01-01T00:00:00.000Z',
          theme: 'dark',
          maxRetries: 5,
        });

        const brokenSchema = SingleEntityESchema.make('BrokenConfig', {
          theme: Schema.String,
          maxRetries: Schema.Number,
        }).build();

        const BrokenConfig = DynamoSingleEntity.make(table)
          .eschema(brokenSchema)
          .default({ theme: 'light', maxRetries: 3 });

        const { Item } = yield* table.getItem(
          { pk: 'BrokenConfig', sk: 'BrokenConfig' },
          { ConsistentRead: true },
        );

        expect(Item).not.toBeNull();
        const inspection = yield* BrokenConfig.inspectMigration(Item!);

        expect(inspection.state).toEqual({ type: 'corrupt' });
      }),
    );

    itEffect('delegates missing _v compatibility to the schema decoder', () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'MissingVersionConfig',
          sk: 'MissingVersionConfig',
          _e: 'MissingVersionConfig',
          _u: '2026-01-01T00:00:00.000Z',
          theme: 'dark',
          maxRetries: 5,
        });

        const missingVersionSchema = SingleEntityESchema.make(
          'MissingVersionConfig',
          {
            theme: Schema.String,
            maxRetries: Schema.Number,
          },
        ).build();

        const MissingVersionConfig = DynamoSingleEntity.make(table)
          .eschema(missingVersionSchema)
          .default({ theme: 'light', maxRetries: 3 });

        const { Item } = yield* table.getItem(
          { pk: 'MissingVersionConfig', sk: 'MissingVersionConfig' },
          { ConsistentRead: true },
        );

        expect(Item).not.toBeNull();
        const inspection = yield* MissingVersionConfig.inspectMigration(Item!);

        expect(inspection.state).toEqual({
          type: 'stale',
          data: true,
          indexes: false,
        });
      }),
    );

    itEffect('reports stored keys that differ from fixed keys', () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'WrongKeyConfig',
          sk: 'WrongKeyConfig',
          _e: 'KeyChangeConfig',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          theme: 'dark',
          maxRetries: 5,
        });

        const keyChangeSchema = SingleEntityESchema.make('KeyChangeConfig', {
          theme: Schema.String,
          maxRetries: Schema.Number,
        }).build();

        const KeyChangeConfig = DynamoSingleEntity.make(table)
          .eschema(keyChangeSchema)
          .default({ theme: 'light', maxRetries: 3 });

        const { Item } = yield* table.getItem(
          { pk: 'WrongKeyConfig', sk: 'WrongKeyConfig' },
          { ConsistentRead: true },
        );

        expect(Item).not.toBeNull();
        const inspection = yield* KeyChangeConfig.inspectMigration(Item!);

        expect(inspection.state).toEqual({ type: 'primaryKeyChanged' });
        expect(Object.keys(inspection).sort()).toEqual([
          'entity',
          'reasons',
          'state',
        ]);
      }),
    );
  });

  describe('delete', () => {
    itEffect('hard-deletes the record and get returns default', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'purple', maxRetries: 7 });

        const before = yield* AppConfig.get();
        expect(before.value.theme).toBe('purple');

        yield* AppConfig.delete();

        const after = yield* AppConfig.get();
        expect(after.value.theme).toBe('light');
        expect(after.value.maxRetries).toBe(3);
        expect(after.meta._u).toBe('');
      }),
    );

    itEffect('is a no-op when item does not exist', () =>
      Effect.gen(function* () {
        const noopSchema = SingleEntityESchema.make('NoopDeleteConfig', {
          value: Schema.String,
        }).build();

        const NoopConfig = DynamoSingleEntity.make(table)
          .eschema(noopSchema)
          .default({ value: 'default' });

        yield* NoopConfig.delete();

        const result = yield* NoopConfig.get();
        expect(result.value.value).toBe('default');
      }),
    );
  });

  describe('updateOp', () => {
    itEffect('returns a TransactItem with plain object update', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

        const op = yield* AppConfig.updateOp({
          update: { theme: 'dark' },
        });

        expect(op.kind).toBe('update');
        expect(op.entityName).toBe('AppConfig');
        expect(op.broadcast).toBeDefined();
        expect(op.broadcast?.value).toMatchObject({
          theme: 'dark',
          maxRetries: 3,
        });
      }),
    );

    itEffect('returns a TransactItem with expression builder', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

        const op = yield* AppConfig.updateOp({
          update: ($) => [$.set('maxRetries', $.opAdd('maxRetries', 10))],
        });

        expect(op.kind).toBe('update');
        expect(op.entityName).toBe('AppConfig');
        expect(op.broadcast).toBeDefined();
      }),
    );

    itEffect('can be executed in a table transaction', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

        const op = yield* AppConfig.updateOp({
          update: { theme: 'neon' },
        });

        yield* table.transact([op]);

        const result = yield* AppConfig.get();
        expect(result.value.theme).toBe('neon');
      }),
    );
  });
});
