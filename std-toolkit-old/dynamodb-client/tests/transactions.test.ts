import type { TestUser } from './dynamodb-effect-utils.js';
import { Effect, Either } from 'effect';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDynamoDB } from '../src/index.js';
import {
  cleanupTestData,
  deleteTestTable,
  setupTestEnvironment,
  TEST_CONFIG,
  TEST_TABLE_NAME,
} from './dynamodb-effect-utils.js';
import { assertSuccessSync, runEffectTest } from './effect-test-utils.js';

describe('dynamoDB transactions', () => {
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

  describe('transactWriteItems', () => {
    it('should perform multiple writes in a single transaction', async () => {
      const users: TestUser[] = [
        {
          userId: 'txn-user-1',
          email: 'txn1@example.com',
          name: 'Transaction User 1',
          age: 25,
          tags: ['transaction', 'test'],
        },
        {
          userId: 'txn-user-2',
          email: 'txn2@example.com',
          name: 'Transaction User 2',
          age: 30,
          tags: ['transaction', 'test'],
        },
      ];

      const program = dynamodb
        .transactWriteItems({
          TransactItems: [
            {
              Put: {
                TableName: TEST_TABLE_NAME,
                Item: {
                  userId: { S: users[0].userId },
                  email: { S: users[0].email },
                  name: { S: users[0].name },
                  age: { N: (users[0].age || 0).toString() },
                  tags: { SS: users[0].tags || [] },
                },
              },
            },
            {
              Put: {
                TableName: TEST_TABLE_NAME,
                Item: {
                  userId: { S: users[1].userId },
                  email: { S: users[1].email },
                  name: { S: users[1].name },
                  age: { N: (users[1].age || 0).toString() },
                  tags: { SS: users[1].tags || [] },
                },
              },
            },
          ],
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result).toBeDefined();
            // TransactWriteItems returns empty response on success
          }),
        );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);

      // Verify both items were inserted
      const verifyUser1 = dynamodb
        .getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: users[0].userId },
          },
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Item).toBeDefined();
            expect(result.Item?.email?.S).toBe(users[0].email);
          }),
        );

      const verifyUser2 = dynamodb
        .getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: users[1].userId },
          },
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Item).toBeDefined();
            expect(result.Item?.email?.S).toBe(users[1].email);
          }),
        );

      const verification = Effect.all([verifyUser1, verifyUser2]);
      const verifyEither = await runEffectTest(verification);
      expect(Either.isRight(verifyEither)).toBe(true);
    });

    it('should handle conditional writes with conditions', async () => {
      const userId = 'conditional-user';

      // First, create a user
      const createUser = dynamodb.putItem({
        TableName: TEST_TABLE_NAME,
        Item: {
          userId: { S: userId },
          email: { S: 'original@example.com' },
          name: { S: 'Original Name' },
          age: { N: '25' },
          version: { N: '1' },
        },
      });

      await runEffectTest(createUser);

      // Now try to update with a condition (version must be 1)
      const program = dynamodb
        .transactWriteItems({
          TransactItems: [
            {
              Update: {
                TableName: TEST_TABLE_NAME,
                Key: {
                  userId: { S: userId },
                },
                UpdateExpression:
                  'SET #name = :newName, #version = :newVersion',
                ConditionExpression: '#version = :currentVersion',
                ExpressionAttributeNames: {
                  '#name': 'name',
                  '#version': 'version',
                },
                ExpressionAttributeValues: {
                  ':newName': { S: 'Updated Name' },
                  ':newVersion': { N: '2' },
                  ':currentVersion': { N: '1' },
                },
              },
            },
          ],
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result).toBeDefined();
          }),
        );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);

      // Verify the update happened
      const verify = dynamodb
        .getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: userId },
          },
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Item?.name?.S).toBe('Updated Name');
            expect(result.Item?.version?.N).toBe('2');
          }),
        );

      const verifyEither = await runEffectTest(verify);
      expect(Either.isRight(verifyEither)).toBe(true);
    });

    it('should rollback transaction when condition fails', async () => {
      const userId1 = 'rollback-user-1';
      const userId2 = 'rollback-user-2';

      // Create first user
      const createUser1 = dynamodb.putItem({
        TableName: TEST_TABLE_NAME,
        Item: {
          userId: { S: userId1 },
          email: { S: 'user1@example.com' },
          name: { S: 'User 1' },
          version: { N: '1' },
        },
      });

      await runEffectTest(createUser1);

      // Try transaction that should fail on condition
      const program = dynamodb.transactWriteItems({
        TransactItems: [
          // This should succeed
          {
            Put: {
              TableName: TEST_TABLE_NAME,
              Item: {
                userId: { S: userId2 },
                email: { S: 'user2@example.com' },
                name: { S: 'User 2' },
              },
            },
          },
          // This should fail (version condition won't match)
          {
            Update: {
              TableName: TEST_TABLE_NAME,
              Key: {
                userId: { S: userId1 },
              },
              UpdateExpression: 'SET #name = :newName',
              ConditionExpression: '#version = :wrongVersion',
              ExpressionAttributeNames: {
                '#name': 'name',
              },
              ExpressionAttributeValues: {
                ':newName': { S: 'Updated User 1' },
                ':wrongVersion': { N: '999' }, // Wrong version
              },
            },
          },
        ],
      });

      const either = await runEffectTest(program);
      expect(Either.isLeft(either)).toBe(true);

      // Verify user1 was not updated
      const verifyUser1 = dynamodb
        .getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: userId1 },
          },
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Item?.name?.S).toBe('User 1'); // Should be unchanged
          }),
        );

      // Verify user2 was not created (transaction rolled back)
      const verifyUser2 = dynamodb
        .getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: userId2 },
          },
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Item).toBeUndefined(); // Should not exist
          }),
        );

      const verification = Effect.all([verifyUser1, verifyUser2]);
      const verifyEither = await runEffectTest(verification);
      expect(Either.isRight(verifyEither)).toBe(true);
    });

    it('should handle mixed operations (Put, Update, Delete)', async () => {
      const userId1 = 'mixed-user-1';
      const userId2 = 'mixed-user-2';
      const userId3 = 'mixed-user-3';

      // Setup: create users 1 and 2
      const setup = Effect.all([
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: userId1 },
            email: { S: 'user1@example.com' },
            name: { S: 'User 1' },
          },
        }),
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: userId2 },
            email: { S: 'user2@example.com' },
            name: { S: 'User 2' },
          },
        }),
      ]);

      await runEffectTest(setup);

      // Mixed transaction: Delete user1, Update user2, Create user3
      const program = dynamodb
        .transactWriteItems({
          TransactItems: [
            {
              Delete: {
                TableName: TEST_TABLE_NAME,
                Key: {
                  userId: { S: userId1 },
                },
              },
            },
            {
              Update: {
                TableName: TEST_TABLE_NAME,
                Key: {
                  userId: { S: userId2 },
                },
                UpdateExpression: 'SET #name = :newName',
                ExpressionAttributeNames: {
                  '#name': 'name',
                },
                ExpressionAttributeValues: {
                  ':newName': { S: 'Updated User 2' },
                },
              },
            },
            {
              Put: {
                TableName: TEST_TABLE_NAME,
                Item: {
                  userId: { S: userId3 },
                  email: { S: 'user3@example.com' },
                  name: { S: 'User 3' },
                },
              },
            },
          ],
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result).toBeDefined();
          }),
        );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);

      // Verify results
      const verifyUser1Deleted = dynamodb
        .getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: userId1 },
          },
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Item).toBeUndefined();
          }),
        );

      const verifyUser2Updated = dynamodb
        .getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: userId2 },
          },
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Item?.name?.S).toBe('Updated User 2');
          }),
        );

      const verifyUser3Created = dynamodb
        .getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: userId3 },
          },
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Item?.name?.S).toBe('User 3');
          }),
        );

      const verification = Effect.all([
        verifyUser1Deleted,
        verifyUser2Updated,
        verifyUser3Created,
      ]);
      const verifyEither = await runEffectTest(verification);
      expect(Either.isRight(verifyEither)).toBe(true);
    });
  });

  describe('transactGetItems', () => {
    it('should retrieve multiple items in a single transaction', async () => {
      const users: TestUser[] = [
        {
          userId: 'get-user-1',
          email: 'get1@example.com',
          name: 'Get User 1',
          age: 28,
          tags: ['get', 'test'],
        },
        {
          userId: 'get-user-2',
          email: 'get2@example.com',
          name: 'Get User 2',
          age: 32,
          tags: ['get', 'test'],
        },
      ];

      // Setup: create test users
      const setup = Effect.all([
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: users[0].userId },
            email: { S: users[0].email },
            name: { S: users[0].name },
            age: { N: (users[0].age || 0).toString() },
            tags: { SS: users[0].tags || [] },
          },
        }),
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: users[1].userId },
            email: { S: users[1].email },
            name: { S: users[1].name },
            age: { N: (users[1].age || 0).toString() },
            tags: { SS: users[1].tags || [] },
          },
        }),
      ]);

      await runEffectTest(setup);

      // Transaction get both users
      const program = dynamodb
        .transactGetItems({
          TransactItems: [
            {
              Get: {
                TableName: TEST_TABLE_NAME,
                Key: {
                  userId: { S: users[0].userId },
                },
              },
            },
            {
              Get: {
                TableName: TEST_TABLE_NAME,
                Key: {
                  userId: { S: users[1].userId },
                },
              },
            },
          ],
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Responses).toBeDefined();
            expect(result.Responses).toHaveLength(2);

            const item1 = result.Responses![0].Item;
            const item2 = result.Responses![1].Item;

            expect(item1?.userId?.S).toBe(users[0].userId);
            expect(item1?.email?.S).toBe(users[0].email);

            expect(item2?.userId?.S).toBe(users[1].userId);
            expect(item2?.email?.S).toBe(users[1].email);
          }),
        );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should handle projection expressions in transactional gets', async () => {
      const userId = 'projection-user';

      // Setup: create user
      const setup = dynamodb.putItem({
        TableName: TEST_TABLE_NAME,
        Item: {
          userId: { S: userId },
          email: { S: 'projection@example.com' },
          name: { S: 'Projection User' },
          age: { N: '35' },
          secretData: { S: 'should-not-be-returned' },
        },
      });

      await runEffectTest(setup);

      // Get with projection (only name and email)
      const program = dynamodb
        .transactGetItems({
          TransactItems: [
            {
              Get: {
                TableName: TEST_TABLE_NAME,
                Key: {
                  userId: { S: userId },
                },
                ProjectionExpression: '#name, email',
                ExpressionAttributeNames: {
                  '#name': 'name',
                },
              },
            },
          ],
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Responses).toBeDefined();
            expect(result.Responses).toHaveLength(1);

            const item = result.Responses![0].Item;
            expect(item?.name?.S).toBe('Projection User');
            expect(item?.email?.S).toBe('projection@example.com');
            expect(item?.age).toBeUndefined(); // Should not be included
            expect(item?.secretData).toBeUndefined(); // Should not be included
          }),
        );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });

    it('should handle mixed existing and non-existing items', async () => {
      const existingUserId = 'existing-user';
      const nonExistingUserId = 'non-existing-user';

      // Setup: create only one user
      const setup = dynamodb.putItem({
        TableName: TEST_TABLE_NAME,
        Item: {
          userId: { S: existingUserId },
          email: { S: 'existing@example.com' },
          name: { S: 'Existing User' },
        },
      });

      await runEffectTest(setup);

      // Try to get both users (one exists, one doesn't)
      const program = dynamodb
        .transactGetItems({
          TransactItems: [
            {
              Get: {
                TableName: TEST_TABLE_NAME,
                Key: {
                  userId: { S: existingUserId },
                },
              },
            },
            {
              Get: {
                TableName: TEST_TABLE_NAME,
                Key: {
                  userId: { S: nonExistingUserId },
                },
              },
            },
          ],
        })
        .pipe(
          assertSuccessSync((result) => {
            expect(result.Responses).toBeDefined();
            expect(result.Responses).toHaveLength(2);

            // First item should exist
            const item1 = result.Responses![0].Item;
            expect(item1?.userId?.S).toBe(existingUserId);
            expect(item1?.email?.S).toBe('existing@example.com');

            // Second item should be empty (but response should still be there)
            const item2 = result.Responses![1].Item;
            expect(item2).toBeUndefined();
          }),
        );

      const either = await runEffectTest(program);
      expect(Either.isRight(either)).toBe(true);
    });
  });

  describe('transaction error handling', () => {
    it('should handle transaction conflict errors properly', async () => {
      const userId = 'conflict-user';

      // Setup: create a user
      const setup = dynamodb.putItem({
        TableName: TEST_TABLE_NAME,
        Item: {
          userId: { S: userId },
          email: { S: 'conflict@example.com' },
          name: { S: 'Conflict User' },
          version: { N: '1' },
        },
      });

      await runEffectTest(setup);

      // Try to perform conflicting condition
      const program = dynamodb.transactWriteItems({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: TEST_TABLE_NAME,
              Key: {
                userId: { S: 'non-existent-user' },
              },
              ConditionExpression: 'attribute_exists(userId)',
            },
          },
        ],
      });

      const either = await runEffectTest(program);
      expect(Either.isLeft(either)).toBe(true);

      if (Either.isLeft(either)) {
        expect(either.left).toBeDefined();
        // Should be a condition check failed error or similar transaction error
      }
    });
  });
});

