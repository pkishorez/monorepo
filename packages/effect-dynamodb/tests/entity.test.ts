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
    pk: {
      schema: UserSchema.schema.pick('userId'),
      fn: ({ userId }) => `USER#${userId}`,
    },
    sk: {
      schema: UserSchema.schema.pick('userId'),
      fn: () => 'PROFILE',
    },
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
    pk: {
      schema: OrderSchema.schema.pick('customerId'),
      fn: ({ customerId }) => `CUSTOMER#${customerId}`,
    },
    sk: {
      schema: OrderSchema.schema.pick('orderId'),
      fn: ({ orderId }) => `ORDER#${orderId}`,
    },
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

  describe('query Operations', () => {
    describe('query Method Existence and Basic Functionality', () => {
      it('should have query method that returns correct metadata structure', async () => {
        const result = await Effect.runPromise(
          UserEntity.query({ pk: { userId: 'non-existent-user' } }),
        );

        // Verify that the query method exists and returns expected structure
        expect(result).toHaveProperty('Items');
        expect(result).toHaveProperty('Count');
        expect(result).toHaveProperty('ScannedCount');
        expect(Array.isArray(result.Items)).toBe(true);
        expect(result.Items).toHaveLength(0);
        expect(result.Count).toBe(0);
      });

      it('should query with partition key and return parsed results', async () => {
        const user = createUser({
          userId: 'query-test-001',
          name: 'Test User',
        });
        await Effect.runPromise(UserEntity.putItem(user));

        const result = await Effect.runPromise(
          UserEntity.query({ pk: { userId: 'query-test-001' } }),
        );

        // Verify query finds the item
        expect(result.Items).toHaveLength(1);
        expect(result.Count).toBe(1);

        // Verify that the returned item is properly parsed
        expect(result.Items[0]).toMatchObject({
          userId: 'query-test-001',
          name: 'Test User',
          status: 'active',
        });
        expect(result.Items[0]).toHaveProperty('email');
        expect(result.Items[0]).toHaveProperty('age');
        expect(result.Items[0]).toHaveProperty('createdAt');
      });
    });

    describe('query with Sort Key Conditions', () => {
      it('should support exact sort key matching', async () => {
        const order = createOrder({
          customerId: 'query-sk-001',
          orderId: 'test-order',
        });
        await Effect.runPromise(OrderEntity.putItem(order));

        const result = await Effect.runPromise(
          OrderEntity.query({
            pk: { customerId: 'query-sk-001' },
            sk: 'ORDER#test-order',
          }),
        );

        expect(result.Items).toHaveLength(1);
        expect(result.Count).toBe(1);
      });

      it('should support sort key expression conditions', async () => {
        const orders = [
          createOrder({ customerId: 'sk-expr-001', orderId: 'order-001' }),
          createOrder({ customerId: 'sk-expr-001', orderId: 'order-002' }),
          createOrder({ customerId: 'sk-expr-001', orderId: 'item-001' }),
        ];

        for (const order of orders) {
          await Effect.runPromise(OrderEntity.putItem(order));
        }

        // Test beginsWith condition
        const result = await Effect.runPromise(
          OrderEntity.query({
            pk: { customerId: 'sk-expr-001' },
            sk: { beginsWith: 'ORDER#order' },
          }),
        );

        expect(result.Items).toHaveLength(2);
        expect(result.Count).toBe(2);
      });
    });

    describe('query with Options', () => {
      it('should respect Limit option', async () => {
        const orders = Array.from({ length: 5 }, (_, i) =>
          createOrder({
            customerId: 'limit-test-001',
            orderId: `order-${i.toString().padStart(3, '0')}`,
          }),
        );

        for (const order of orders) {
          await Effect.runPromise(OrderEntity.putItem(order));
        }

        const result = await Effect.runPromise(
          OrderEntity.query(
            {
              pk: { customerId: 'limit-test-001' },
            },
            {
              Limit: 2,
            },
          ),
        );

        expect(result.Items).toHaveLength(2);
        expect(result.LastEvaluatedKey).toBeDefined();
      });

      it('should support ConsistentRead option', async () => {
        const user = createUser({
          userId: 'consistent-001',
          name: 'Consistent User',
        });
        await Effect.runPromise(UserEntity.putItem(user));

        const result = await Effect.runPromise(
          UserEntity.query(
            {
              pk: { userId: 'consistent-001' },
            },
            {
              ConsistentRead: true,
            },
          ),
        );

        expect(result.Items).toHaveLength(1);
        expect(result.Count).toBe(1);
      });

      it('should support projection expressions', async () => {
        const orders = [
          createOrder({
            customerId: 'projection-001',
            orderId: 'order-1',
            amount: 100,
            status: 'pending',
          }),
          createOrder({
            customerId: 'projection-001',
            orderId: 'order-2',
            amount: 200,
            status: 'completed',
          }),
        ];

        for (const order of orders) {
          await Effect.runPromise(OrderEntity.putItem(order));
        }

        const result = await Effect.runPromise(
          OrderEntity.query(
            {
              pk: { customerId: 'projection-001' },
            },
            {
              projection: ['customerId', 'orderId', 'status'],
            },
          ),
        );

        expect(result.Items).toHaveLength(2);
        expect(result.Count).toBe(2);

        // Verify that only projected fields are present
        result.Items.forEach((item) => {
          expect(item).toHaveProperty('customerId');
          expect(item).toHaveProperty('orderId');
          expect(item).toHaveProperty('status');
          // These fields should not be present in projection
          expect(item).not.toHaveProperty('amount');
        });

        // Verify specific values for first item
        expect(result.Items[0].customerId).toBe('projection-001');
        expect(result.Items[0].orderId).toBe('order-1');
        expect(result.Items[0].status).toBe('pending');
      });

      it('should support filter expressions', async () => {
        const orders = [
          createOrder({
            customerId: 'filter-001',
            orderId: 'order-1',
            amount: 50,
            status: 'pending',
          }),
          createOrder({
            customerId: 'filter-001',
            orderId: 'order-2',
            amount: 150,
            status: 'completed',
          }),
          createOrder({
            customerId: 'filter-001',
            orderId: 'order-3',
            amount: 300,
            status: 'pending',
          }),
        ];

        for (const order of orders) {
          await Effect.runPromise(OrderEntity.putItem(order));
        }

        // Test simple filter condition
        const highAmountResult = await Effect.runPromise(
          OrderEntity.query(
            {
              pk: { customerId: 'filter-001' },
            },
            {
              filter: { amount: { '>': 100 } },
            },
          ),
        );

        expect(highAmountResult.Items).toHaveLength(2);
        expect(highAmountResult.Count).toBe(2);

        // Test string equality filter
        const pendingResult = await Effect.runPromise(
          OrderEntity.query(
            {
              pk: { customerId: 'filter-001' },
            },
            {
              filter: { status: { '=': 'pending' } },
            },
          ),
        );

        expect(pendingResult.Items).toHaveLength(2);
        expect(pendingResult.Count).toBe(2);
      });
    });

    describe('query with Complex Filter Expressions', () => {
      it('should support combined filter and projection expressions', async () => {
        const users = [
          createUser({
            userId: 'combo-001',
            name: 'Young Active',
            age: 25,
            status: 'active',
          }),
          createUser({
            userId: 'combo-002',
            name: 'Old Active',
            age: 65,
            status: 'active',
          }),
          createUser({
            userId: 'combo-003',
            name: 'Young Inactive',
            age: 30,
            status: 'inactive',
          }),
        ];

        for (const user of users) {
          await Effect.runPromise(UserEntity.putItem(user));
        }

        const result = await Effect.runPromise(
          UserEntity.query(
            {
              pk: { userId: 'combo-001' },
            },
            {
              filter: { age: { '<': 50 } },
              projection: ['userId', 'name', 'age'],
            },
          ),
        );

        expect(result.Items).toHaveLength(1);
        expect(result.Count).toBe(1);

        // Verify that only projected fields are present and filter was applied
        const item = result.Items[0];
        expect(item).toHaveProperty('userId');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('age');
        expect(item).not.toHaveProperty('email');
        expect(item).not.toHaveProperty('status');
        expect(item).not.toHaveProperty('createdAt');

        // Verify the filter worked (age < 50)
        expect(item.age).toBeLessThan(50);
        expect(item.userId).toBe('combo-001');
        expect(item.name).toBe('Young Active');
      });

      it('should support multiple filter conditions', async () => {
        const orders = [
          createOrder({
            customerId: 'multi-filter-001',
            orderId: 'small-pending',
            amount: 50,
            status: 'pending',
          }),
          createOrder({
            customerId: 'multi-filter-001',
            orderId: 'large-pending',
            amount: 500,
            status: 'pending',
          }),
          createOrder({
            customerId: 'multi-filter-001',
            orderId: 'large-completed',
            amount: 800,
            status: 'completed',
          }),
        ];

        for (const order of orders) {
          await Effect.runPromise(OrderEntity.putItem(order));
        }

        // Test complex filter: amount > 100 AND status = 'pending'
        const result = await Effect.runPromise(
          OrderEntity.query(
            {
              pk: { customerId: 'multi-filter-001' },
            },
            {
              filter: {
                amount: { '>': 100 },
                status: { '=': 'pending' },
              },
            },
          ),
        );

        // Only the large-pending order should match
        expect(result.Items).toHaveLength(1);
        expect(result.Count).toBe(1);
      });

      it('should support string function filters', async () => {
        const users = [
          createUser({
            userId: 'string-001',
            name: 'Alice Johnson',
            email: 'alice@example.com',
          }),
          createUser({
            userId: 'string-002',
            name: 'Bob Smith',
            email: 'bob@test.com',
          }),
          createUser({
            userId: 'string-003',
            name: 'Charlie Johnson',
            email: 'charlie@example.com',
          }),
        ];

        for (const user of users) {
          await Effect.runPromise(UserEntity.putItem(user));
        }

        // Test contains filter on email
        const exampleEmailResult = await Effect.runPromise(
          UserEntity.query(
            {
              pk: { userId: 'string-001' },
            },
            {
              filter: { email: { contains: 'example' } },
            },
          ),
        );

        expect(exampleEmailResult.Items).toHaveLength(1);
        expect(exampleEmailResult.Count).toBe(1);

        // Test beginsWith filter on name
        const charlieResult = await Effect.runPromise(
          UserEntity.query(
            {
              pk: { userId: 'string-003' },
            },
            {
              filter: { name: { beginsWith: 'Charlie' } },
            },
          ),
        );

        expect(charlieResult.Items).toHaveLength(1);
        expect(charlieResult.Count).toBe(1);
      });

      it('should support size function filters', async () => {
        const users = [
          createUser({
            userId: 'size-001',
            name: 'Jo', // Short name
            email: 'jo@example.com',
          }),
          createUser({
            userId: 'size-002',
            name: 'Alexander', // Long name
            email: 'alex@example.com',
          }),
        ];

        for (const user of users) {
          await Effect.runPromise(UserEntity.putItem(user));
        }

        // Test size filter on name length
        const longNameResult = await Effect.runPromise(
          UserEntity.query(
            {
              pk: { userId: 'size-002' },
            },
            {
              filter: { name: { size: { '>': 5 } } },
            },
          ),
        );

        expect(longNameResult.Items).toHaveLength(1);
        expect(longNameResult.Count).toBe(1);
      });
    });

    describe('query Edge Cases', () => {
      it('should handle empty results gracefully', async () => {
        const result = await Effect.runPromise(
          UserEntity.query({ pk: { userId: 'non-existent-user' } }),
        );

        expect(result.Items).toHaveLength(0);
        expect(result.Count).toBe(0);
        expect(result.LastEvaluatedKey).toBeUndefined();
      });

      it('should handle sort key with no matches', async () => {
        const order = createOrder({
          customerId: 'no-match-001',
          orderId: 'existing-order',
        });
        await Effect.runPromise(OrderEntity.putItem(order));

        const result = await Effect.runPromise(
          OrderEntity.query({
            pk: { customerId: 'no-match-001' },
            sk: { beginsWith: 'NONEXISTENT#' },
          }),
        );

        expect(result.Items).toHaveLength(0);
        expect(result.Count).toBe(0);
      });
    });
  });

  describe('index Query Operations', () => {
    // NOTE: Index query functionality is available in the entity implementation,
    // but there appears to be a bug in the entity builder pattern where index
    // configurations are not being properly passed through to the entity instance.
    // The error "Invalid partition provided" occurs because this.#secondaries[indexName]
    // is undefined in the index query method.

    // TODO: Fix the builder pattern in EntitySecondaryIndexEnhancer.index() method
    // The issue is likely in the spread operator logic at src/entity/entity.ts:294-297
    // It should spread this.#secondaries, not config.

    it('should have index method available', () => {
      // Verify that the index method exists on entities
      expect(typeof table.query).toBe('function'); // Table-level queries work

      // Create a simple entity to test method existence
      const TestSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      ).build();

      const TestEntity = DynamoEntity.make(table, TestSchema)
        .primary({
          pk: {
            schema: TestSchema.schema.pick('id'),
            fn: ({ id }) => `TEST#${id}`,
          },
          sk: {
            schema: TestSchema.schema.pick('id'),
            fn: () => 'PROFILE',
          },
        })
        .build();

      expect(typeof TestEntity.index).toBe('function');
      expect(typeof TestEntity.query).toBe('function');
    });

    // Placeholder tests that can be enabled once the builder pattern is fixed
    it('should query GSI by partition key', async () => {
      // Create test entity with GSI configuration
      const ProductSchema = ESchema.make(
        'v1',
        Schema.Struct({
          productId: Schema.String,
          categoryId: Schema.String,
          brandId: Schema.String,
          name: Schema.String,
        }),
      ).build();

      const ProductEntity = DynamoEntity.make(table, ProductSchema)
        .primary({
          pk: {
            schema: ProductSchema.schema.pick('productId'),
            fn: ({ productId }) => `PRODUCT#${productId}`,
          },
          sk: {
            schema: ProductSchema.schema.pick('productId'),
            fn: () => 'DETAILS',
          },
        })
        .index('GSI1', {
          pk: {
            schema: ProductSchema.schema.pick('categoryId'),
            fn: ({ categoryId }) => `CATEGORY#${categoryId}`,
          },
          sk: {
            schema: ProductSchema.schema.pick('brandId'),
            fn: ({ brandId }) => `BRAND#${brandId}`,
          },
        })
        .build();

      const product = ProductEntity.make({
        productId: 'test-001',
        categoryId: 'electronics',
        brandId: 'samsung',
        name: 'Test Phone',
      });

      await Effect.runPromise(ProductEntity.putItem(product));

      const result = await Effect.runPromise(
        ProductEntity.index('GSI1').query({
          pk: { categoryId: 'electronics' },
        }),
      );

      expect(result.Items).toHaveLength(1);
      expect(result.Items[0].name).toBe('Test Phone');
    });

    it('should query GSI with sort key condition', async () => {
      const ProductSchema = ESchema.make(
        'v1',
        Schema.Struct({
          productId: Schema.String,
          variantId: Schema.String,
          categoryId: Schema.String,
          brandId: Schema.String,
          name: Schema.String,
          price: Schema.Number,
        }),
      ).build();

      const ProductEntity = DynamoEntity.make(table, ProductSchema)
        .primary({
          pk: {
            schema: ProductSchema.schema.pick('productId'),
            fn: ({ productId }) => `PRODUCT#${productId}`,
          },
          sk: {
            schema: ProductSchema.schema.pick('variantId'),
            fn: ({ variantId }) => `VARIANT#${variantId}`,
          },
        })
        .index('GSI1', {
          pk: {
            schema: ProductSchema.schema.pick('categoryId'),
            fn: ({ categoryId }) => `CATEGORY#${categoryId}`,
          },
          sk: {
            schema: ProductSchema.schema.pick('brandId'),
            fn: ({ brandId }) => `BRAND#${brandId}`,
          },
        })
        .build();

      // Create products with different brands in same category
      const products = [
        {
          productId: 'gsi-sk-001',
          variantId: 'v1',
          categoryId: 'electronics',
          brandId: 'apple',
          name: 'iPhone',
          price: 999,
        },
        {
          productId: 'gsi-sk-002',
          variantId: 'v1',
          categoryId: 'electronics',
          brandId: 'samsung',
          name: 'Galaxy',
          price: 899,
        },
        {
          productId: 'gsi-sk-003',
          variantId: 'v1',
          categoryId: 'electronics',
          brandId: 'sony',
          name: 'Xperia',
          price: 799,
        },
      ];

      for (const product of products) {
        await Effect.runPromise(ProductEntity.putItem(product));
      }

      // Query for specific brand
      const exactResult = await Effect.runPromise(
        ProductEntity.index('GSI1').query({
          pk: { categoryId: 'electronics' },
          sk: 'BRAND#samsung',
        }),
      );

      expect(exactResult.Items).toHaveLength(1);
      expect(exactResult.Items[0]).toMatchObject({
        name: 'Galaxy',
        brandId: 'samsung',
      });

      // Query with begins_with condition
      const beginsWithResult = await Effect.runPromise(
        ProductEntity.index('GSI1').query({
          pk: { categoryId: 'electronics' },
          sk: { beginsWith: 'BRAND#s' },
        }),
      );

      expect(beginsWithResult.Items).toHaveLength(2); // samsung and sony
      expect(beginsWithResult.Items.map((item) => item.brandId).sort()).toEqual(
        ['samsung', 'sony'],
      );

      // Query with between condition
      const betweenResult = await Effect.runPromise(
        ProductEntity.index('GSI1').query({
          pk: { categoryId: 'electronics' },
          sk: { between: ['BRAND#a', 'BRAND#t'] },
        }),
      );

      expect(betweenResult.Items).toHaveLength(3); // all brands fall in this range
    });

    it('should query LSI', async () => {
      const OrderSchema = ESchema.make(
        'v1',
        Schema.Struct({
          customerId: Schema.String,
          orderId: Schema.String,
          orderDate: Schema.String,
          status: Schema.String,
          total: Schema.Number,
        }),
      ).build();

      const OrderEntity = DynamoEntity.make(table, OrderSchema)
        .primary({
          pk: {
            schema: OrderSchema.schema.pick('customerId'),
            fn: ({ customerId }) => `CUSTOMER#${customerId}`,
          },
          sk: {
            schema: OrderSchema.schema.pick('orderId'),
            fn: ({ orderId }) => `ORDER#${orderId}`,
          },
        })
        .index('LSI1', {
          pk: {
            schema: OrderSchema.schema.pick('customerId'),
            fn: ({ customerId }) => `CUSTOMER#${customerId}`,
          },
          sk: {
            schema: OrderSchema.schema.pick('orderDate'),
            fn: ({ orderDate }) => `DATE#${orderDate}`,
          },
        })
        .build();

      // Create orders with different dates
      const orders = [
        {
          customerId: 'cust-lsi-001',
          orderId: 'order-001',
          orderDate: '2024-01-15',
          status: 'delivered',
          total: 150,
        },
        {
          customerId: 'cust-lsi-001',
          orderId: 'order-002',
          orderDate: '2024-02-20',
          status: 'pending',
          total: 200,
        },
        {
          customerId: 'cust-lsi-001',
          orderId: 'order-003',
          orderDate: '2024-03-10',
          status: 'shipped',
          total: 175,
        },
      ];

      for (const order of orders) {
        await Effect.runPromise(OrderEntity.putItem(order));
      }

      // Query using LSI to get orders by date
      const result = await Effect.runPromise(
        OrderEntity.index('LSI1').query({
          pk: { customerId: 'cust-lsi-001' },
          sk: { between: ['DATE#2024-01-01', 'DATE#2024-02-28'] },
        }),
      );

      expect(result.Items).toHaveLength(2);
      expect(result.Items.map((item) => item.orderId).sort()).toEqual([
        'order-001',
        'order-002',
      ]);

      // Query with greater than condition
      const gtResult = await Effect.runPromise(
        OrderEntity.index('LSI1').query({
          pk: { customerId: 'cust-lsi-001' },
          sk: { '>': 'DATE#2024-02-01' },
        }),
      );

      expect(gtResult.Items).toHaveLength(2);
      expect(gtResult.Items.map((item) => item.orderId).sort()).toEqual([
        'order-002',
        'order-003',
      ]);

      // Query with filter on non-key attributes
      const filteredResult = await Effect.runPromise(
        OrderEntity.index('LSI1').query(
          {
            pk: { customerId: 'cust-lsi-001' },
          },
          {
            filter: {
              status: { '=': 'pending' },
            },
          },
        ),
      );

      expect(filteredResult.Items).toHaveLength(1);
      expect(filteredResult.Items[0]).toMatchObject({
        orderId: 'order-002',
        status: 'pending',
      });
    });
  });
});
