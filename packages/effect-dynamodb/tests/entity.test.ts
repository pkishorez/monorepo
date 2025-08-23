import { ESchema } from '@monorepo/eschema';
import { Effect, Either, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { DynamoEntity } from '../src/entity/entity.js';
import { cleanTable, table } from './setup.js';

// Test utility to run Effect and return Either
async function runEither<E, A>(
  effect: Effect.Effect<A, E>,
): Promise<Either.Either<A, E>> {
  return await Effect.runPromise(Effect.either(effect));
}

// Test schema
const UserSchema = ESchema.make(
  'v1',
  Schema.Struct({
    userId: Schema.String,
    name: Schema.String,
    email: Schema.String,
    age: Schema.Number,
    status: Schema.Literal('active', 'inactive'),
    createdAt: Schema.String,
  }),
).build();

// Test entity
const UserEntity = DynamoEntity.make(table, UserSchema)
  .primary({
    schema: UserSchema.schema.pick('userId'),
    fn: ({ userId }) => ({ pkey: `USER#${userId}`, skey: 'PROFILE' }),
  })
  .build();

// Composite key entity for testing
const OrderSchema = ESchema.make(
  'v1',
  Schema.Struct({
    customerId: Schema.String,
    orderId: Schema.String,
    amount: Schema.Number,
    status: Schema.String,
  }),
).build();

const OrderEntity = DynamoEntity.make(table, OrderSchema)
  .primary({
    schema: OrderSchema.schema.pick('customerId', 'orderId'),
    fn: ({ customerId, orderId }) => ({
      pkey: `CUSTOMER#${customerId}`,
      skey: `ORDER#${orderId}`,
    }),
  })
  .build();

// Test utilities
function createUser(
  overrides: Partial<Schema.Schema.Type<typeof UserSchema.schema>> = {},
) {
  return UserEntity.make({
    userId: 'user-001',
    name: 'John Doe',
    email: 'john@example.com',
    age: 30,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

function createOrder(
  overrides: Partial<Schema.Schema.Type<typeof OrderSchema.schema>> = {},
) {
  return OrderEntity.make({
    customerId: 'cust-001',
    orderId: 'order-001',
    amount: 99.99,
    status: 'pending',
    ...overrides,
  });
}

beforeEach(async () => {
  await cleanTable();
});

describe('dynamoEntity CRUD Operations', () => {
  describe('getItem', () => {
    it('should get item by primary key', async () => {
      const user = createUser();

      // Put item directly to table first
      await Effect.runPromise(
        table.putItem({
          pkey: `USER#${user.userId}`,
          skey: 'PROFILE',
          ...user,
        }),
      );

      // Get item via entity
      const result = await Effect.runPromise(
        UserEntity.getItem({ userId: user.userId }),
      );

      expect(result.Item).toMatchObject({
        userId: user.userId,
        name: user.name,
        email: user.email,
        age: user.age,
        status: user.status,
      });
    });

    it('should return null for non-existent item', async () => {
      const result = await Effect.runPromise(
        UserEntity.getItem({ userId: 'non-existent' }),
      );

      expect(result.Item).toBeNull();
    });

    it('should handle composite primary keys', async () => {
      const order = createOrder();

      // Put item with composite key
      await Effect.runPromise(
        table.putItem({
          pkey: `CUSTOMER#${order.customerId}`,
          skey: `ORDER#${order.orderId}`,
          ...order,
        }),
      );

      const result = await Effect.runPromise(
        OrderEntity.getItem({
          customerId: order.customerId,
          orderId: order.orderId,
        }),
      );

      expect(result.Item).toMatchObject({
        customerId: order.customerId,
        orderId: order.orderId,
        amount: order.amount,
        status: order.status,
      });
    });

    it('should parse schema with version correctly', async () => {
      const user = createUser();

      // Put item with version metadata
      await Effect.runPromise(
        table.putItem({
          pkey: `USER#${user.userId}`,
          skey: 'PROFILE',
          ...user,
          __v: 'v1',
        }),
      );

      const result = await Effect.runPromise(
        UserEntity.getItem({ userId: user.userId }),
      );

      expect(result.Item).toBeDefined();
      expect(result.Item?.userId).toBe(user.userId);
    });
  });

  describe('putItem', () => {
    it('should put item with proper key generation', async () => {
      const user = createUser();

      await Effect.runPromise(UserEntity.putItem(user));

      // Verify item was stored with correct keys
      const getResult = await Effect.runPromise(
        table.getItem({
          pkey: `USER#${user.userId}`,
          skey: 'PROFILE',
        }),
      );

      expect(getResult.Item).toBeDefined();
      expect(getResult.Item?.userId).toBe(user.userId);
      expect(getResult.Item?.name).toBe(user.name);
      expect(getResult.Item?.email).toBe(user.email);
      expect(getResult.Item?.pkey).toBe(`USER#${user.userId}`);
      expect(getResult.Item?.skey).toBe('PROFILE');
    });

    it('should validate schema before putting', async () => {
      const invalidUser = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 'not-a-number', // Invalid type
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        __v: 'v1',
      } as any;

      const result = await runEither(UserEntity.putItem(invalidUser));

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeDefined();
      }
    });

    it('should handle composite keys correctly', async () => {
      const order = createOrder();

      await Effect.runPromise(OrderEntity.putItem(order));

      const result = await Effect.runPromise(
        table.getItem({
          pkey: `CUSTOMER#${order.customerId}`,
          skey: `ORDER#${order.orderId}`,
        }),
      );

      expect(result.Item).toBeDefined();
      expect(result.Item?.customerId).toBe(order.customerId);
      expect(result.Item?.orderId).toBe(order.orderId);
      expect(result.Item?.amount).toBe(order.amount);
      expect(result.Item?.pkey).toBe(`CUSTOMER#${order.customerId}`);
      expect(result.Item?.skey).toBe(`ORDER#${order.orderId}`);
    });

    it('should return old values when requested', async () => {
      const user = createUser();

      // First put
      await Effect.runPromise(UserEntity.putItem(user));

      // Second put with return values
      const updatedUser = createUser({
        userId: user.userId, // Same ID
        name: 'New User',
        age: 31,
      });

      const result = await Effect.runPromise(
        UserEntity.putItem(updatedUser, {
          ReturnValues: 'ALL_OLD',
        }),
      );

      // Should return old values
      expect(result.Attributes).toMatchObject({
        userId: user.userId,
        name: 'John Doe', // Old name
        age: 30, // Old age
      });
    });
  });

  describe('updateItem', () => {
    it('should update item attributes', async () => {
      const user = createUser();
      await Effect.runPromise(UserEntity.putItem(user));

      const result = await Effect.runPromise(
        UserEntity.updateItem(
          { userId: user.userId },
          {
            update: {
              SET: {
                age: { op: 'assign', value: 31 },
                status: { op: 'assign', value: 'inactive' as const },
              },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(result.Attributes).toMatchObject({
        userId: user.userId,
        name: user.name,
        age: 31,
        status: 'inactive',
      });
    });

    it('should handle ADD operations for numbers', async () => {
      const order = createOrder();
      await Effect.runPromise(OrderEntity.putItem(order));

      const result = await Effect.runPromise(
        OrderEntity.updateItem(
          { customerId: order.customerId, orderId: order.orderId },
          {
            update: {
              ADD: {
                amount: 10.01,
              },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(result.Attributes?.amount).toBeCloseTo(110, 1);
    });

    it('should handle REMOVE operations', async () => {
      const user = createUser();
      await Effect.runPromise(UserEntity.putItem(user));

      const result = await Effect.runPromise(
        UserEntity.updateItem(
          { userId: user.userId },
          {
            update: {
              REMOVE: ['createdAt'],
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(result.Attributes).toBeDefined();
      expect(result.Attributes?.createdAt).toBeUndefined();
    });

    it('should handle update with conditions', async () => {
      const user = createUser();
      await Effect.runPromise(UserEntity.putItem(user));

      // Update should succeed when condition is met
      const result = await Effect.runPromise(
        UserEntity.updateItem(
          { userId: user.userId },
          {
            update: {
              SET: {
                age: { op: 'assign', value: 31 },
              },
            },
            condition: {
              status: { '=': 'active' },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(result.Attributes?.age).toBe(31);

      // Update should fail when condition is not met
      const updateResult = await runEither(
        UserEntity.updateItem(
          { userId: user.userId },
          {
            update: {
              SET: {
                age: { op: 'assign', value: 32 },
              },
            },
            condition: {
              status: { '=': 'deleted' },
            },
          },
        ),
      );

      expect(Either.isLeft(updateResult)).toBe(true);
      if (Either.isLeft(updateResult)) {
        expect(updateResult.left).toBeDefined();
      }
    });

    it('should return partial data correctly', async () => {
      const user = createUser();
      await Effect.runPromise(UserEntity.putItem(user));

      const result = await Effect.runPromise(
        UserEntity.updateItem(
          { userId: user.userId },
          {
            update: {
              SET: {
                age: { op: 'assign', value: 31 },
              },
            },
            ReturnValues: 'UPDATED_NEW',
          },
        ),
      );

      // Should handle partial schema
      expect(result.Attributes).toBeDefined();
      expect(result.Attributes?.age).toBe(31);
    });
  });

  describe('delete', () => {
    it('should delete item', async () => {
      const user = createUser();
      await Effect.runPromise(UserEntity.putItem(user));

      const result = await Effect.runPromise(
        UserEntity.delete({ userId: user.userId }),
      );

      expect(result).toBeDefined();
      // Check that the delete was successful - Attributes is undefined since no ReturnValues was specified
      expect(result.Attributes).toBeUndefined();

      // Verify item was deleted
      const getResult = await Effect.runPromise(
        UserEntity.getItem({ userId: user.userId }),
      );

      expect(getResult.Item).toBeNull();
    });

    it('should handle composite keys for delete', async () => {
      const order = createOrder();
      await Effect.runPromise(OrderEntity.putItem(order));

      await Effect.runPromise(
        OrderEntity.delete({
          customerId: order.customerId,
          orderId: order.orderId,
        }),
      );

      const getResult = await Effect.runPromise(
        OrderEntity.getItem({
          customerId: order.customerId,
          orderId: order.orderId,
        }),
      );

      expect(getResult.Item).toBeNull();
    });

    it('should return deleted item when requested', async () => {
      const user = createUser();
      await Effect.runPromise(UserEntity.putItem(user));

      const result = await Effect.runPromise(
        UserEntity.delete({ userId: user.userId }, { ReturnValues: 'ALL_OLD' }),
      );

      expect(result.Attributes).toMatchObject({
        userId: user.userId,
        name: user.name,
        email: user.email,
        age: user.age,
      });
    });

    it('should handle delete with conditions', async () => {
      const user = createUser();
      await Effect.runPromise(UserEntity.putItem(user));

      // Delete should succeed when condition is met
      const result = await Effect.runPromise(
        UserEntity.delete(
          { userId: user.userId },
          {
            condition: {
              status: { '=': 'active' }, // Wrong status
            },
            ReturnValues: 'ALL_OLD',
          },
        ),
      );

      expect(result.Attributes?.userId).toBe(user.userId);

      // Verify deletion
      const getResult = await Effect.runPromise(
        UserEntity.getItem({ userId: user.userId }),
      );
      expect(getResult.Item).toBeNull();
    });

    it('should fail delete when condition is not met (TODO: fix entity schema parsing on conditional failures)', async () => {
      const user = createUser();
      await Effect.runPromise(UserEntity.putItem(user));

      // Try to delete with wrong condition - should fail
      const deleteResult = await runEither(
        UserEntity.delete(
          { userId: user.userId },
          {
            condition: {
              status: { '=': 'inactive' }, // Wrong condition
            },
          },
        ),
      );

      expect(Either.isLeft(deleteResult)).toBe(true);
      if (Either.isLeft(deleteResult)) {
        // We should have a typed error here
        expect(deleteResult.left).toBeDefined();
      }

      // Item should still exist
      const getResult = await Effect.runPromise(
        UserEntity.getItem({ userId: user.userId }),
      );
      expect(getResult.Item).toBeDefined();
    });
  });

  describe('error Handling', () => {
    it('should handle missing required fields', async () => {
      const incompleteUser = {
        userId: 'user-001',
        name: 'John Doe',
        // Missing email, age, status, createdAt
        __v: 'v1',
      } as any;

      const result = await runEither(UserEntity.putItem(incompleteUser));

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeDefined();
      }
    });

    it('should handle schema parsing errors on get', async () => {
      const user = createUser();

      // Put raw invalid data directly
      await Effect.runPromise(
        table.putItem({
          pkey: `USER#${user.userId}`,
          skey: 'PROFILE',
          userId: user.userId,
          name: user.name,
          email: user.email,
          age: 'invalid-age', // Invalid type
          status: user.status,
          createdAt: user.createdAt,
          __v: 'v1',
        }),
      );

      // Try to get with entity (should fail on parse)
      const result = await runEither(
        UserEntity.getItem({ userId: user.userId }),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeDefined();
      }
    });
  });
});
