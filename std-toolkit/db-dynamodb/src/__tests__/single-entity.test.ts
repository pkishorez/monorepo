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
