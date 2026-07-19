import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const itEffect = <A, E>(
  name: string,
  fn: () => Effect.Effect<A, E, DynamoDB>,
) =>
  it(name, () =>
    Effect.runPromise(fn().pipe(Effect.provide(dynamoDBLayer(localConfig)))),
  );
import { Effect, Schema } from 'effect';
import { EntityESchema } from '../../../eschema/index.js';
import { DynamoTable, DynamodbError } from '../index.js';
import {
  createDynamoDB,
  dynamoDBLayer,
  DynamoDB,
} from '../services/dynamo-client.js';

const TEST_TABLE_NAME = `db-dynamodb-error-test-${Date.now()}`;
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

// New ESchema API: idField is second parameter
const userSchema = EntityESchema.make('User', 'userId', {
  name: Schema.String,
}).build();

// New DynamoEntity API: SK is automatically the idField
const UserEntity = table
  .entity(userSchema)
  .primary({ pk: ['userId'] })
  .build();

async function createTestTable() {
  const client = createDynamoDB(localConfig);

  const createParams = {
    TableName: TEST_TABLE_NAME,
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' as const },
      { AttributeName: 'sk', KeyType: 'RANGE' as const },
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' as const },
      { AttributeName: 'sk', AttributeType: 'S' as const },
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

describe('DynamoDB Error Handling', () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  describe('Entity.insert - ItemAlreadyExists', () => {
    itEffect('fails with ItemAlreadyExists when inserting duplicate item', () =>
      Effect.gen(function* () {
        const user = { userId: 'duplicate-test', name: 'Test User' };

        yield* UserEntity.insert(user);

        const error = yield* UserEntity.insert(user).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe('ItemAlreadyExists');
      }),
    );
  });

  describe('Entity.update - NoItemToUpdate', () => {
    itEffect('fails with NoItemToUpdate when updating non-existent item', () =>
      Effect.gen(function* () {
        const error = yield* UserEntity.update(
          { userId: 'non-existent-id' },
          { update: { name: 'Updated Name' } },
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe('NoItemToUpdate');
      }),
    );

    itEffect('succeeds when item exists', () =>
      Effect.gen(function* () {
        const userId = 'version-mismatch-test';
        const user = { userId, name: 'Original' };
        yield* UserEntity.insert(user);

        yield* UserEntity.update(
          { userId: userId },
          { update: { name: 'Updated Once' } },
        );

        const result = yield* UserEntity.get({ userId: userId });
        expect(result?.value.name).toBe('Updated Once');
      }),
    );
  });

  describe('Table operations with non-existent table', () => {
    const badTable = DynamoTable.make().primary('pk', 'sk').build();
    const badLayer = dynamoDBLayer({
      ...localConfig,
      tableName: 'non-existent-table',
    });
    const itEffect = <A, E>(
      name: string,
      fn: () => Effect.Effect<A, E, DynamoDB>,
    ) => it(name, () => Effect.runPromise(fn().pipe(Effect.provide(badLayer))));

    itEffect('fails with QueryFailed when querying non-existent table', () =>
      Effect.gen(function* () {
        const error = yield* badTable.query({ pk: 'TEST#1' }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe('QueryFailed');
      }),
    );

    itEffect(
      'fails with GetItemFailed when getting item from non-existent table',
      () =>
        Effect.gen(function* () {
          const error = yield* badTable
            .getItem({ pk: 'TEST#1', sk: 'ITEM#1' })
            .pipe(Effect.flip);

          expect(error).toBeInstanceOf(DynamodbError);
          expect(error.error._tag).toBe('GetItemFailed');
        }),
    );

    itEffect(
      'fails with PutItemFailed when putting item to non-existent table',
      () =>
        Effect.gen(function* () {
          const error = yield* badTable
            .putItem({ pk: 'TEST#1', sk: 'ITEM#1', data: 'test' })
            .pipe(Effect.flip);

          expect(error).toBeInstanceOf(DynamodbError);
          expect(error.error._tag).toBe('PutItemFailed');
        }),
    );

    itEffect(
      'fails with DeleteItemFailed when deleting item from non-existent table',
      () =>
        Effect.gen(function* () {
          const error = yield* badTable
            .deleteItem({ pk: 'TEST#1', sk: 'ITEM#1' })
            .pipe(Effect.flip);

          expect(error).toBeInstanceOf(DynamodbError);
          expect(error.error._tag).toBe('DeleteItemFailed');
        }),
    );

    itEffect('fails with ScanFailed when scanning non-existent table', () =>
      Effect.gen(function* () {
        const error = yield* badTable.scan().pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe('ScanFailed');
      }),
    );
  });

  describe('Entity operations with non-existent table', () => {
    const badTable = DynamoTable.make().primary('pk', 'sk').build();
    const badLayer = dynamoDBLayer({
      ...localConfig,
      tableName: 'non-existent-entity-table',
    });
    const itEffect = <A, E>(
      name: string,
      fn: () => Effect.Effect<A, E, DynamoDB>,
    ) => it(name, () => Effect.runPromise(fn().pipe(Effect.provide(badLayer))));

    const BadUserEntity = badTable
      .entity(userSchema)
      .primary({ pk: ['userId'] })
      .build();

    itEffect(
      'fails with PutItemFailed when inserting entity on non-existent table',
      () =>
        Effect.gen(function* () {
          const error = yield* BadUserEntity.insert({
            userId: '1',
            name: 'Test',
          }).pipe(Effect.flip);

          expect(error).toBeInstanceOf(DynamodbError);
          expect(error.error._tag).toBe('PutItemFailed');
        }),
    );

    itEffect(
      'fails with GetItemFailed when getting entity from non-existent table',
      () =>
        Effect.gen(function* () {
          const error = yield* BadUserEntity.get({
            userId: '1',
          }).pipe(Effect.flip);

          expect(error).toBeInstanceOf(DynamodbError);
          expect(error.error._tag).toBe('GetItemFailed');
        }),
    );

    itEffect(
      'fails with QueryFailed when querying entity on non-existent table',
      () =>
        Effect.gen(function* () {
          const error = yield* BadUserEntity.query('primary', {
            pk: { userId: '1' },
            sk: { '>=': null },
          }).pipe(Effect.flip);

          expect(error).toBeInstanceOf(DynamodbError);
          expect(error.error._tag).toBe('QueryFailed');
        }),
    );
  });

  describe('Error cause preservation', () => {
    const badTable = DynamoTable.make().primary('pk', 'sk').build();
    const badLayer = dynamoDBLayer({
      ...localConfig,
      tableName: 'non-existent-cause-table',
    });
    const itEffect = <A, E>(
      name: string,
      fn: () => Effect.Effect<A, E, DynamoDB>,
    ) => it(name, () => Effect.runPromise(fn().pipe(Effect.provide(badLayer))));

    itEffect('preserves underlying AWS error details in cause', () =>
      Effect.gen(function* () {
        const error = yield* badTable
          .getItem({ pk: 'TEST#1', sk: 'ITEM#1' })
          .pipe(Effect.flip);

        expect(error.error._tag).toBe('GetItemFailed');
        if (error.error._tag === 'GetItemFailed') {
          expect(error.error.cause).toBeDefined();
          expect(error.error.cause).toBeInstanceOf(DynamodbError);
          const innerError = error.error.cause as DynamodbError;
          expect(innerError.error._tag).toBe('UnknownAwsError');
          if (innerError.error._tag === 'UnknownAwsError') {
            expect(innerError.error.name).toBe('ResourceNotFoundException');
          }
        }
      }),
    );
  });
});
