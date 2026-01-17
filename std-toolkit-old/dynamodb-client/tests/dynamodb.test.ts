import type { TestUser } from './dynamodb-effect-utils.js';
import { Effect, Either } from 'effect';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDynamoDB } from '../src/index.js';
import {
  cleanupTestData,
  deleteTestTable,
  getTestUser,
  putTestUser,
  seedQueryTestData,
  seedScanTestData,
  setupTestEnvironment,
  TEST_CONFIG,
  TEST_TABLE_NAME,
} from './dynamodb-effect-utils.js';
import {
  assertSuccessSync,
  expectEffect,
  runEffectTest,
} from './effect-test-utils.js';

describe('dynamoDB Client - Effect.TS', () => {
  const dynamodb = createDynamoDB(TEST_CONFIG);

  beforeAll(async () => {
    const setup = setupTestEnvironment(dynamodb);
    const either = await runEffectTest(setup);

    if (Either.isLeft(either)) {
      console.warn('Test setup failed:', either.left);
    }
  });

  beforeEach(async () => {
    const cleanup = cleanupTestData(dynamodb);
    await runEffectTest(cleanup);
  });

  afterAll(async () => {
    const cleanup = deleteTestTable(dynamodb);
    await runEffectTest(cleanup);
  });

  describe('basic item operations', () => {
    const testUser: TestUser = {
      userId: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      age: 30,
      tags: ['developer', 'tester'],
    };

    it('should put an item', async () => {
      const program = putTestUser(dynamodb, testUser).pipe(
        assertSuccessSync((result) => {
          expect(result).toBeDefined();
        }),
      );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should get an item', async () => {
      const program = Effect.gen(function* () {
        // First put the item
        yield* putTestUser(dynamodb, testUser);

        // Then get it
        const result = yield* getTestUser(dynamodb, testUser.userId);

        yield* expectEffect(() => expect(result.Item).toBeDefined());
        yield* expectEffect(() =>
          expect(result.Item!.userId.S).toBe(testUser.userId),
        );
        yield* expectEffect(() =>
          expect(result.Item!.email.S).toBe(testUser.email),
        );
        yield* expectEffect(() =>
          expect(result.Item!.name.S).toBe(testUser.name),
        );
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should update an item', async () => {
      const program = Effect.gen(function* () {
        // First put the item
        yield* putTestUser(dynamodb, { ...testUser, age: 25 });

        // Update it
        const result = yield* dynamodb.updateItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: testUser.userId },
          },
          UpdateExpression: 'SET age = :age, #n = :name',
          ExpressionAttributeValues: {
            ':age': { N: '30' },
            ':name': { S: 'Updated Name' },
          },
          ExpressionAttributeNames: {
            '#n': 'name',
          },
          ReturnValues: 'ALL_NEW',
        });

        yield* expectEffect(() => expect(result.Attributes).toBeDefined());
        yield* expectEffect(() => expect(result.Attributes!.age.N).toBe('30'));
        yield* expectEffect(() =>
          expect(result.Attributes!.name.S).toBe('Updated Name'),
        );
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should delete an item', async () => {
      const program = Effect.gen(function* () {
        // First put the item
        yield* putTestUser(dynamodb, testUser);

        // Delete it
        const deleteResult = yield* dynamodb.deleteItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: testUser.userId },
          },
          ReturnValues: 'ALL_OLD',
        });

        yield* expectEffect(() =>
          expect(deleteResult.Attributes).toBeDefined(),
        );
        yield* expectEffect(() =>
          expect(deleteResult.Attributes!.userId.S).toBe(testUser.userId),
        );

        // Verify it's gone
        const getResult = yield* getTestUser(dynamodb, testUser.userId);
        yield* expectEffect(() => expect(getResult.Item).toBeUndefined());
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });
  });

  describe('batch operations', () => {
    it('should batch write items', async () => {
      const program = dynamodb
        .batchWriteItem({
          RequestItems: {
            [TEST_TABLE_NAME]: [
              {
                PutRequest: {
                  Item: {
                    userId: { S: 'batch-1' },
                    email: { S: 'batch1@example.com' },
                    name: { S: 'Batch User 1' },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: 'batch-2' },
                    email: { S: 'batch2@example.com' },
                    name: { S: 'Batch User 2' },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: 'batch-3' },
                    email: { S: 'batch3@example.com' },
                    name: { S: 'Batch User 3' },
                  },
                },
              },
            ],
          },
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result).toBeDefined();
            expect(result.UnprocessedItems).toEqual({});
          }),
        );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should batch get items', async () => {
      const program = Effect.gen(function* () {
        // First put some items
        yield* dynamodb.batchWriteItem({
          RequestItems: {
            [TEST_TABLE_NAME]: [
              {
                PutRequest: {
                  Item: {
                    userId: { S: 'batch-get-1' },
                    email: { S: 'batchget1@example.com' },
                    name: { S: 'Batch Get User 1' },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: 'batch-get-2' },
                    email: { S: 'batchget2@example.com' },
                    name: { S: 'Batch Get User 2' },
                  },
                },
              },
            ],
          },
        });

        // Then batch get them
        const result = yield* dynamodb.batchGetItem({
          RequestItems: {
            [TEST_TABLE_NAME]: {
              Keys: [
                { userId: { S: 'batch-get-1' } },
                { userId: { S: 'batch-get-2' } },
                { userId: { S: 'nonexistent' } },
              ],
            },
          },
        });

        yield* expectEffect(() => expect(result.Responses).toBeDefined());
        yield* expectEffect(() =>
          expect(result.Responses![TEST_TABLE_NAME]).toHaveLength(2),
        );

        const items = result.Responses![TEST_TABLE_NAME];
        const userIds = items.map((item) => item.userId.S).sort();
        yield* expectEffect(() =>
          expect(userIds).toEqual(['batch-get-1', 'batch-get-2']),
        );
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });
  });

  describe('query operations', () => {
    it('should query by primary key', async () => {
      const program = Effect.gen(function* () {
        yield* seedQueryTestData(dynamodb);

        const result = yield* dynamodb.query({
          TableName: TEST_TABLE_NAME,
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': { S: 'query-user-1' },
          },
        });

        yield* expectEffect(() => expect(result.Items).toBeDefined());
        yield* expectEffect(() => expect(result.Items).toHaveLength(1));
        yield* expectEffect(() =>
          expect(result.Items![0].userId.S).toBe('query-user-1'),
        );
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should query with GSI', async () => {
      const program = Effect.gen(function* () {
        yield* seedQueryTestData(dynamodb);

        const result = yield* dynamodb.query({
          TableName: TEST_TABLE_NAME,
          IndexName: 'EmailIndex',
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: {
            ':email': { S: 'query2@example.com' },
          },
        });

        yield* expectEffect(() => expect(result.Items).toBeDefined());
        yield* expectEffect(() => expect(result.Items).toHaveLength(1));
        yield* expectEffect(() =>
          expect(result.Items![0].email.S).toBe('query2@example.com'),
        );
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should query with filter expression', async () => {
      const program = Effect.gen(function* () {
        yield* seedQueryTestData(dynamodb);

        const result = yield* dynamodb.query({
          TableName: TEST_TABLE_NAME,
          KeyConditionExpression: 'userId = :userId',
          FilterExpression: 'age > :minAge',
          ExpressionAttributeValues: {
            ':userId': { S: 'query-user-2' },
            ':minAge': { N: '20' },
          },
        });

        yield* expectEffect(() => expect(result.Items).toBeDefined());
        yield* expectEffect(() => expect(result.Items).toHaveLength(1));
        yield* expectEffect(() =>
          expect(result.Items![0].userId.S).toBe('query-user-2'),
        );
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });
  });

  describe('scan operations', () => {
    it('should scan all items', async () => {
      const program = Effect.gen(function* () {
        yield* seedScanTestData(dynamodb);

        const result = yield* dynamodb.scan({
          TableName: TEST_TABLE_NAME,
        });

        yield* expectEffect(() => expect(result.Items).toBeDefined());
        yield* expectEffect(() =>
          expect(result.Items!.length).toBeGreaterThanOrEqual(3),
        );
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should scan with filter expression', async () => {
      const program = Effect.gen(function* () {
        yield* seedScanTestData(dynamodb);

        const result = yield* dynamodb.scan({
          TableName: TEST_TABLE_NAME,
          FilterExpression: 'active = :active',
          ExpressionAttributeValues: {
            ':active': { BOOL: true },
          },
        });

        yield* expectEffect(() => expect(result.Items).toBeDefined());
        yield* expectEffect(() =>
          expect(result.Items!.length).toBeGreaterThanOrEqual(2),
        );

        // All returned items should have active = true
        for (const item of result.Items!) {
          yield* expectEffect(() => expect(item.active?.BOOL).toBe(true));
        }
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should scan with limit', async () => {
      const program = Effect.gen(function* () {
        yield* seedScanTestData(dynamodb);

        const result = yield* dynamodb.scan({
          TableName: TEST_TABLE_NAME,
          Limit: 2,
        });

        yield* expectEffect(() => expect(result.Items).toBeDefined());
        yield* expectEffect(() =>
          expect(result.Items!.length).toBeLessThanOrEqual(2),
        );
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should scan with pagination', async () => {
      const program = Effect.gen(function* () {
        yield* seedScanTestData(dynamodb);

        // First scan with limit
        const firstResult = yield* dynamodb.scan({
          TableName: TEST_TABLE_NAME,
          Limit: 1,
        });

        yield* expectEffect(() => expect(firstResult.Items).toBeDefined());
        yield* expectEffect(() => expect(firstResult.Items!.length).toBe(1));

        // If there's more data, test pagination
        if (firstResult.LastEvaluatedKey) {
          const secondResult = yield* dynamodb.scan({
            TableName: TEST_TABLE_NAME,
            Limit: 1,
            ExclusiveStartKey: firstResult.LastEvaluatedKey,
          });

          yield* expectEffect(() => expect(secondResult.Items).toBeDefined());
          yield* expectEffect(() => expect(secondResult.Items!.length).toBe(1));

          // Should be different items
          yield* expectEffect(() =>
            expect(secondResult.Items![0].userId.S).not.toBe(
              firstResult.Items![0].userId.S,
            ),
          );
        }
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });
  });

  describe('error handling with Either', () => {
    it('should handle table not found error', async () => {
      const program = dynamodb.getItem({
        TableName: 'nonexistent-table',
        Key: {
          userId: { S: 'test' },
        },
      });

      const either = await runEffectTest(program);
      expect(Either.isLeft(either)).toBe(true);

      if (Either.isLeft(either)) {
        // Check that we get a proper error type
        expect(either.left).toBeDefined();

        expect(typeof either.left).toBe('object');
      }
    });

    it('should handle validation errors', async () => {
      const program = dynamodb.putItem({
        TableName: TEST_TABLE_NAME,
        Item: {
          // Missing required key attribute
          email: { S: 'test@example.com' },
        },
      });

      const either = await runEffectTest(program);
      expect(Either.isLeft(either)).toBe(true);

      if (Either.isLeft(either)) {
        expect(either.left).toBeDefined();
      }
    });

    it('should handle conditional check failures', async () => {
      const program = Effect.gen(function* () {
        // Put an item first
        yield* putTestUser(dynamodb, {
          userId: 'conditional-test',
          email: 'conditional@example.com',
          name: 'Conditional Test',
        });

        // Try to put with condition that should fail
        const conditionalPut = dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: 'conditional-test' },
            email: { S: 'new@example.com' },
            name: { S: 'New Name' },
          },
          ConditionExpression: 'attribute_not_exists(userId)',
        });

        const either = yield* Effect.either(conditionalPut);
        yield* expectEffect(() => expect(Either.isLeft(either)).toBe(true));

        if (Either.isLeft(either)) {
          yield* expectEffect(() => expect(either.left).toBeDefined());
        }
      });

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });
  });

  describe('table operations', () => {
    it('should list tables', async () => {
      const program = dynamodb
        .listTables({
          Limit: 10,
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.TableNames).toBeDefined();
            expect(result.TableNames).toContain(TEST_TABLE_NAME);
          }),
        );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should describe table', async () => {
      const program = dynamodb
        .describeTable({
          TableName: TEST_TABLE_NAME,
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Table).toBeDefined();
            expect(result.Table!.TableName).toBe(TEST_TABLE_NAME);
            expect(result.Table!.TableStatus).toBe('ACTIVE');
          }),
        );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });
  });
});
