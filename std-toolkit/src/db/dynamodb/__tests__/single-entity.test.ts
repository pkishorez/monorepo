import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const itEffect = <A, E>(
  name: string,
  fn: () => Effect.Effect<A, E, DynamoDB>,
) =>
  it(name, () =>
    Effect.runPromise(fn().pipe(Effect.provide(dynamoDBLayer(localConfig)))),
  );
import { Effect, Schema } from 'effect';
import { SingleEntityESchema } from '../../../eschema/index.js';
import { DynamoTable } from '../index.js';
import {
  createDynamoDB,
  dynamoDBLayer,
  DynamoDB,
} from '../services/dynamo-client.js';

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

const table = DynamoTable.make().primary('pk', 'sk').build();

const configSchema = SingleEntityESchema.make('AppConfig', {
  theme: Schema.String,
  maxRetries: Schema.Number,
}).build();

const AppConfig = table
  .singleEntity(configSchema)
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
      Effect.catch((e) => {
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

        const EmptyConfig = table
          .singleEntity(emptySchema)
          .default({ value: 'x' });

        const error = yield* EmptyConfig.update({
          update: { value: 'y' },
        }).pipe(Effect.flip);

        expect(error.error._tag).toBe('NoItemToUpdate');
      }),
    );
  });

  describe('reset', () => {
    itEffect('writes the default value back and get returns it', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'purple', maxRetries: 7 });

        const before = yield* AppConfig.get();
        expect(before.value.theme).toBe('purple');

        const reverted = yield* AppConfig.reset();

        const after = yield* AppConfig.get();
        expect(reverted.meta._u > before.meta._u).toBe(true);
        expect(after.value.theme).toBe('light');
        expect(after.value.maxRetries).toBe(3);
        expect(after.meta._u).toBe(reverted.meta._u);
      }),
    );

    itEffect('creates the default record when item does not exist', () =>
      Effect.gen(function* () {
        const noopSchema = SingleEntityESchema.make('NoopResetConfig', {
          value: Schema.String,
        }).build();

        const NoopConfig = table
          .singleEntity(noopSchema)
          .default({ value: 'default' });

        const reverted = yield* NoopConfig.reset();

        const result = yield* NoopConfig.get();
        expect(result.value.value).toBe('default');
        expect(result.meta._u).toBe(reverted.meta._u);
      }),
    );
  });

  describe('updateOp', () => {
    itEffect('returns a TransactItem with plain object update', () =>
      Effect.gen(function* () {
        const initial = yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

        const op = yield* AppConfig.updateOp({
          update: { theme: 'dark' },
        });

        const applied = op.apply('01TESTULID0000000000000000');
        expect(applied.kind).toBe('update');
        expect(op.entityName).toBe('AppConfig');
        expect(applied.broadcast.value).toMatchObject({
          theme: 'dark',
          maxRetries: 3,
        });
        expect(applied.broadcast.meta._u).not.toBe(initial.meta._u);
      }),
    );

    itEffect('returns a TransactItem with expression builder', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

        const op = yield* AppConfig.updateOp({
          update: ($) => [$.set('maxRetries', $.opAdd('maxRetries', 10))],
        });

        const applied = op.apply('01TESTULID0000000000000000');
        expect(applied.kind).toBe('update');
        expect(op.entityName).toBe('AppConfig');
        expect(applied.broadcast).toBeDefined();
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
