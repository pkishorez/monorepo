import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Schema, Stream } from 'effect';
import { EntityESchema, SingleEntityESchema } from '@std-toolkit/eschema';
import {
  DynamoTable,
  DynamoEntity,
  DynamoSingleEntity,
  EntityRegistry,
  DynamodbError,
  exprUpdate,
  buildExpr,
  opAdd,
  exprCondition,
  exprFilter,
} from '../index.js';
import { createDynamoDB } from '../services/dynamo-client.js';

// Use timestamp-based name to avoid schema conflicts between test runs
const TEST_TABLE_NAME = `db-dynamodb-test-${Date.now()}`;
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

// Create table instance directly (no Layer)
const table = DynamoTable.make(localConfig)
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .build();

// Schema definitions for entity tests
// New ESchema API: idField is second parameter
const userSchema = EntityESchema.make('User', 'userId', {
  name: Schema.String,
  email: Schema.String,
  status: Schema.String,
  age: Schema.Number,
}).build();

// Entity receives table instance directly
// New API: SK is automatically the idField
const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({ pk: ['userId'] })
  .index('GSI1', 'byEmail', { pk: ['email'] })
  .index('GSI2', 'byStatus', { pk: ['status'] })
  .build();

// Order schema for more complex tests
const orderSchema = EntityESchema.make('Order', 'orderId', {
  userId: Schema.String,
  total: Schema.Number,
  status: Schema.String,
  items: Schema.Array(
    Schema.Struct({
      productId: Schema.String,
      quantity: Schema.Number,
      price: Schema.Number,
    }),
  ),
}).build();

// SK is automatically the idField (orderId)
const OrderEntity = DynamoEntity.make(table)
  .eschema(orderSchema)
  .primary({ pk: ['userId'] })
  .build();

// Product schema for custom SK tests
const productSchema = EntityESchema.make('Product', 'productId', {
  category: Schema.String,
  name: Schema.String,
  price: Schema.Number,
}).build();

// Custom SK index: GSI1 sorts by name, GSI2 sorts by price (via _u default)
const ProductEntity = DynamoEntity.make(table)
  .eschema(productSchema)
  .primary({ pk: ['category'] })
  .index('GSI1', 'byName', { pk: ['category'], sk: ['name'] })
  .index('GSI2', 'byCategoryDefault', { pk: ['category'] })
  .build();

// Helper to create the test table
async function createTestTable() {
  const client = createDynamoDB(localConfig);

  // Create the table
  const createParams = {
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
  };

  await Effect.runPromise(
    client.createTable(createParams).pipe(
      Effect.catchAll((e) => {
        // Table already exists is fine, ResourceInUseException
        const errorName = (e as any)?.error?.name;
        if (errorName === 'ResourceInUseException') {
          return Effect.void;
        }
        return Effect.fail(e);
      }),
    ),
  );
}

// Helper to delete the test table
async function deleteTestTable() {
  try {
    const client = createDynamoDB(localConfig);
    await Effect.runPromise(client.deleteTable({ TableName: TEST_TABLE_NAME }));
  } catch {
    // Ignore cleanup errors
  }
}

describe('@std-toolkit/db-dynamodb Integration Tests', () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  describe('DynamoTable - Low-level Operations', () => {
    describe('putItem / getItem', () => {
      itEffect('puts and retrieves an item', () =>
        Effect.gen(function* () {
          // Put an item
          yield* table.putItem({
            pk: 'TEST#1',
            sk: 'ITEM#1',
            name: 'Test Item',
            count: 42,
            active: true,
          });

          // Get the item
          const result = yield* table.getItem({ pk: 'TEST#1', sk: 'ITEM#1' });

          expect(result.Item).not.toBeNull();
          expect(result.Item?.name).toBe('Test Item');
          expect(result.Item?.count).toBe(42);
          expect(result.Item?.active).toBe(true);
        }),
      );

      itEffect('returns null for non-existent item', () =>
        Effect.gen(function* () {
          const result = yield* table.getItem({
            pk: 'NONEXISTENT#1',
            sk: 'ITEM#1',
          });

          expect(result.Item).toBeNull();
        }),
      );

      itEffect('supports ConsistentRead option', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'TEST#consistent',
            sk: 'ITEM#1',
            value: 'test',
          });

          const result = yield* table.getItem(
            { pk: 'TEST#consistent', sk: 'ITEM#1' },
            { ConsistentRead: true },
          );

          expect(result.Item).not.toBeNull();
          expect(result.Item?.value).toBe('test');
        }),
      );

      itEffect('puts item with condition expression', () =>
        Effect.gen(function* () {
          // First put
          yield* table.putItem({
            pk: 'TEST#cond',
            sk: 'ITEM#1',
            version: 1,
          });

          // Conditional put that should fail
          const result = yield* table
            .putItem(
              { pk: 'TEST#cond', sk: 'ITEM#1', version: 2 },
              {
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            )
            .pipe(Effect.either);

          expect(result._tag).toBe('Left');
        }),
      );
    });

    describe('updateItem', () => {
      itEffect('updates an existing item', () =>
        Effect.gen(function* () {
          // Create item
          yield* table.putItem({
            pk: 'TEST#update',
            sk: 'ITEM#1',
            name: 'Original',
            count: 0,
          });

          // Update item
          const update = exprUpdate<{ name: string; count: number }>(($) => [
            $.set('name', 'Updated'),
            $.set('count', opAdd('count', 5)),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'TEST#update', sk: 'ITEM#1' },
            {
              ...exprResult,
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes).not.toBeNull();
          expect(result.Attributes?.name).toBe('Updated');
          expect(result.Attributes?.count).toBe(5);
        }),
      );

      itEffect('creates item on update if not exists (upsert behavior)', () =>
        Effect.gen(function* () {
          const update = exprUpdate<{ name: string }>(($) => [
            $.set('name', 'New Item'),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'TEST#upsert', sk: 'ITEM#1' },
            {
              ...exprResult,
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.name).toBe('New Item');
        }),
      );

      itEffect('updates with conditional expression', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'TEST#condupdate',
            sk: 'ITEM#1',
            status: 'active',
            count: 10,
          });

          const update = exprUpdate<{ count: number }>(($) => [
            $.set('count', opAdd('count', 1)),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'TEST#condupdate', sk: 'ITEM#1' },
            {
              ...exprResult,
              ConditionExpression: '#cf_status = :cf_active',
              ExpressionAttributeNames: {
                ...exprResult.ExpressionAttributeNames,
                '#cf_status': 'status',
              },
              ExpressionAttributeValues: {
                ...exprResult.ExpressionAttributeValues,
                ':cf_active': { S: 'active' },
              },
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.count).toBe(11);
        }),
      );

      itEffect('returns ALL_OLD on update', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'TEST#allold',
            sk: 'ITEM#1',
            name: 'Original',
          });

          const update = exprUpdate<{ name: string }>(($) => [
            $.set('name', 'Changed'),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'TEST#allold', sk: 'ITEM#1' },
            {
              ...exprResult,
              ReturnValues: 'ALL_OLD',
            },
          );

          expect(result.Attributes?.name).toBe('Original');
        }),
      );
    });

    describe('deleteItem', () => {
      itEffect('deletes an existing item', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'TEST#delete',
            sk: 'ITEM#1',
            data: 'to be deleted',
          });

          yield* table.deleteItem({ pk: 'TEST#delete', sk: 'ITEM#1' });

          const result = yield* table.getItem({
            pk: 'TEST#delete',
            sk: 'ITEM#1',
          });
          expect(result.Item).toBeNull();
        }),
      );

      itEffect('deleting non-existent item succeeds silently', () =>
        Effect.gen(function* () {
          // Should not throw
          yield* table.deleteItem({
            pk: 'NONEXISTENT#delete',
            sk: 'ITEM#999',
          });
        }),
      );
    });

    describe('query', () => {
      // Shared query fixture
      const SHARED_QUERY_PK = 'QUERY_SHARED';

      beforeAll(async () => {
        await Effect.runPromise(
          Effect.gen(function* () {
            yield* table.putItem({
              pk: SHARED_QUERY_PK,
              sk: 'A',
              data: 'a',
              score: 100,
            });
            yield* table.putItem({
              pk: SHARED_QUERY_PK,
              sk: 'B',
              data: 'b',
              score: 200,
            });
            yield* table.putItem({
              pk: SHARED_QUERY_PK,
              sk: 'C',
              data: 'c',
              score: 300,
            });
            yield* table.putItem({
              pk: SHARED_QUERY_PK,
              sk: 'D',
              data: 'd',
              score: 400,
            });
          }),
        );
      });

      itEffect('queries items by partition key', () =>
        Effect.gen(function* () {
          const result = yield* table.query({ pk: SHARED_QUERY_PK });
          expect(result.Items.length).toBe(4);
        }),
      );

      itEffect('queries with sort key equals', () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: 'B',
          });

          expect(result.Items.length).toBe(1);
          expect(result.Items[0]?.data).toBe('b');
        }),
      );

      itEffect('queries with begins_with', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'BEGINSWITH#1',
            sk: 'ORDER#2024-01',
            data: 'jan',
          });
          yield* table.putItem({
            pk: 'BEGINSWITH#1',
            sk: 'ORDER#2024-02',
            data: 'feb',
          });
          yield* table.putItem({
            pk: 'BEGINSWITH#1',
            sk: 'ORDER#2023-12',
            data: 'dec',
          });

          const result = yield* table.query({
            pk: 'BEGINSWITH#1',
            sk: { beginsWith: 'ORDER#2024' },
          });

          expect(result.Items.length).toBe(2);
        }),
      );

      itEffect('queries with between', () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { between: ['B', 'C'] },
          });

          expect(result.Items.length).toBe(2);
          expect(result.Items.map((i) => i.data).sort()).toEqual(['b', 'c']);
        }),
      );

      itEffect('queries with less than (<)', () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { '<': 'C' },
          });

          expect(result.Items.length).toBe(2);
          expect(result.Items.map((i) => i.data).sort()).toEqual(['a', 'b']);
        }),
      );

      itEffect('queries with less than or equal (<=)', () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { '<=': 'C' },
          });

          expect(result.Items.length).toBe(3);
          expect(result.Items.map((i) => i.data).sort()).toEqual([
            'a',
            'b',
            'c',
          ]);
        }),
      );

      itEffect('queries with greater than (>)', () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { '>': 'B' },
          });

          expect(result.Items.length).toBe(2);
          expect(result.Items.map((i) => i.data).sort()).toEqual(['c', 'd']);
        }),
      );

      itEffect('queries with greater than or equal (>=)', () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { '>=': 'B' },
          });

          expect(result.Items.length).toBe(3);
          expect(result.Items.map((i) => i.data).sort()).toEqual([
            'b',
            'c',
            'd',
          ]);
        }),
      );

      itEffect('queries with Limit', () =>
        Effect.gen(function* () {
          const result = yield* table.query(
            { pk: SHARED_QUERY_PK },
            { Limit: 2 },
          );

          expect(result.Items.length).toBe(2);
        }),
      );

      itEffect('queries with ScanIndexForward false (descending)', () =>
        Effect.gen(function* () {
          const result = yield* table.query(
            { pk: SHARED_QUERY_PK },
            { ScanIndexForward: false },
          );

          expect(result.Items[0]?.sk).toBe('D');
          expect(result.Items[3]?.sk).toBe('A');
        }),
      );
    });

    describe('scan', () => {
      itEffect('scans all items in table', () =>
        Effect.gen(function* () {
          const result = yield* table.scan();

          // Should have items from previous tests
          expect(result.Items.length).toBeGreaterThan(0);
        }),
      );

      itEffect('scans with Limit', () =>
        Effect.gen(function* () {
          const result = yield* table.scan({ Limit: 5 });

          expect(result.Items.length).toBeLessThanOrEqual(5);
        }),
      );
    });

    describe('index operations', () => {
      itEffect('queries GSI by index name', () =>
        Effect.gen(function* () {
          // Insert items with GSI keys
          yield* table.putItem({
            pk: 'USER#100',
            sk: 'PROFILE',
            GSI1PK: 'EMAIL#alice@example.com',
            GSI1SK: '100',
            name: 'Alice',
          });
          yield* table.putItem({
            pk: 'USER#101',
            sk: 'PROFILE',
            GSI1PK: 'EMAIL#bob@example.com',
            GSI1SK: '101',
            name: 'Bob',
          });

          const result = yield* table
            .index('GSI1')
            .query({ pk: 'EMAIL#alice@example.com' });

          expect(result.Items.length).toBe(1);
          expect(result.Items[0]?.name).toBe('Alice');
        }),
      );

      itEffect('scans GSI', () =>
        Effect.gen(function* () {
          const result = yield* table.index('GSI1').scan();

          // Should have items with GSI pk from previous test
          expect(result.Items.some((i) => i['GSI1PK'])).toBe(true);
        }),
      );
    });

    describe('transactions', () => {
      itEffect('executes multiple operations atomically', () =>
        Effect.gen(function* () {
          const op1 = table.opPutItem({
            pk: 'TXN#1',
            sk: 'ITEM#A',
            value: 'transaction item A',
          });

          const op2 = table.opPutItem({
            pk: 'TXN#1',
            sk: 'ITEM#B',
            value: 'transaction item B',
          });

          yield* table.transact([op1, op2]);

          // Verify both items exist
          const item1 = yield* table.getItem({ pk: 'TXN#1', sk: 'ITEM#A' });
          const item2 = yield* table.getItem({ pk: 'TXN#1', sk: 'ITEM#B' });

          expect(item1.Item).not.toBeNull();
          expect(item2.Item).not.toBeNull();
          expect(item1.Item?.value).toBe('transaction item A');
          expect(item2.Item?.value).toBe('transaction item B');
        }),
      );

      itEffect('executes update operations in transaction', () =>
        Effect.gen(function* () {
          // Setup items
          yield* table.putItem({
            pk: 'TXN_UPDATE#1',
            sk: 'ITEM#A',
            count: 10,
          });
          yield* table.putItem({
            pk: 'TXN_UPDATE#1',
            sk: 'ITEM#B',
            count: 20,
          });

          const update1 = exprUpdate<{ count: number }>(($) => [
            $.set('count', opAdd('count', 5)),
          ]);
          const expr1 = buildExpr({ update: update1 });

          const update2 = exprUpdate<{ count: number }>(($) => [
            $.set('count', opAdd('count', -5)),
          ]);
          const expr2 = buildExpr({ update: update2 });

          const op1 = table.opUpdateItem(
            { pk: 'TXN_UPDATE#1', sk: 'ITEM#A' },
            expr1,
          );

          const op2 = table.opUpdateItem(
            { pk: 'TXN_UPDATE#1', sk: 'ITEM#B' },
            expr2,
          );

          yield* table.transact([op1, op2]);

          const item1 = yield* table.getItem({
            pk: 'TXN_UPDATE#1',
            sk: 'ITEM#A',
          });
          const item2 = yield* table.getItem({
            pk: 'TXN_UPDATE#1',
            sk: 'ITEM#B',
          });

          expect(item1.Item?.count).toBe(15);
          expect(item2.Item?.count).toBe(15);
        }),
      );
    });

    describe('dangerouslyPurgeAllItems', () => {
      itEffect('deletes all items from the table', () =>
        Effect.gen(function* () {
          yield* table.putItem({ pk: 'PURGE#1', sk: 'A', value: '1' });
          yield* table.putItem({ pk: 'PURGE#1', sk: 'B', value: '2' });
          yield* table.putItem({ pk: 'PURGE#2', sk: 'A', value: '3' });

          const before = yield* table.scan();
          expect(before.Items.length).toBeGreaterThanOrEqual(3);

          yield* table.dangerouslyPurgeAllItems('I KNOW WHAT I AM DOING');

          const after = yield* table.scan();
          expect(after.Items.length).toBe(0);
        }),
      );
    });
  });

  describe('DynamoEntity - High-level Operations', () => {
    describe('insert', () => {
      itEffect('inserts a new entity', () =>
        Effect.gen(function* () {
          const result = yield* UserEntity.insert({
            userId: 'entity-insert-1',
            name: 'Test User',
            email: 'test@example.com',
            status: 'active',
            age: 30,
          });

          expect(result.value.userId).toBe('entity-insert-1');
          expect(result.value.name).toBe('Test User');
          expect(result.meta._e).toBe('User');
          expect(result.meta._d).toBe(false);
        }),
      );

      itEffect('fails when inserting duplicate entity', () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: 'entity-dup-1',
            name: 'First',
            email: 'dup@example.com',
            status: 'active',
            age: 25,
          });

          const result = yield* UserEntity.insert({
            userId: 'entity-dup-1',
            name: 'Second',
            email: 'dup2@example.com',
            status: 'inactive',
            age: 26,
          }).pipe(Effect.either);

          expect(result._tag).toBe('Left');
        }),
      );
    });

    describe('get', () => {
      itEffect('retrieves an existing entity', () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: 'entity-get-1',
            name: 'Get Test',
            email: 'get@example.com',
            status: 'active',
            age: 35,
          });

          const result = yield* UserEntity.get({
            userId: 'entity-get-1',
          });

          expect(result).not.toBeNull();
          expect(result?.value.name).toBe('Get Test');
          expect(result?.meta._e).toBe('User');
        }),
      );

      itEffect('returns null for non-existent entity', () =>
        Effect.gen(function* () {
          const result = yield* UserEntity.get({
            userId: 'nonexistent-entity',
          });

          expect(result).toBeNull();
        }),
      );
    });

    describe('update', () => {
      itEffect('updates an existing entity', () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: 'entity-update-1',
            name: 'Original Name',
            email: 'update@example.com',
            status: 'active',
            age: 40,
          });

          const result = yield* UserEntity.update(
            { userId: 'entity-update-1' },
            { update: { name: 'Updated Name', age: 41 } },
          );

          expect(result.value.name).toBe('Updated Name');
          expect(result.value.age).toBe(41);
        }),
      );

      itEffect('updates _u on each update', () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: 'entity-incr-1',
            name: 'Increment Test',
            email: 'incr@example.com',
            status: 'active',
            age: 25,
          });

          const first = yield* UserEntity.update(
            { userId: 'entity-incr-1' },
            { update: { name: 'Update 1' } },
          );

          const second = yield* UserEntity.update(
            { userId: 'entity-incr-1' },
            { update: { name: 'Update 2' } },
          );

          // _u should be different after each update
          expect(second.meta._u).not.toBe(first.meta._u);
        }),
      );

      itEffect('can use condition for optimistic locking', () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: 'entity-lock-1',
            name: 'Lock Test',
            email: 'lock@example.com',
            status: 'active',
            age: 30,
          });

          // Update with condition succeeds
          const result = yield* UserEntity.update(
            { userId: 'entity-lock-1' },
            { update: { name: 'Update 1' } },
          );

          expect(result.value.name).toBe('Update 1');
        }),
      );
    });

    describe('query', () => {
      itEffect('queries entities by primary key', () =>
        Effect.gen(function* () {
          yield* OrderEntity.insert({
            orderId: 'order-001',
            userId: 'query-user-1',
            total: 100,
            status: 'pending',
            items: [],
          });
          yield* OrderEntity.insert({
            orderId: 'order-002',
            userId: 'query-user-1',
            total: 200,
            status: 'completed',
            items: [],
          });

          const result = yield* OrderEntity.query('primary', {
            pk: { userId: 'query-user-1' },
            sk: { '>=': null },
          });

          expect(result.items.length).toBe(2);
        }),
      );

      itEffect('queries with limit', () =>
        Effect.gen(function* () {
          const result = yield* OrderEntity.query(
            'primary',
            { pk: { userId: 'query-user-1' }, sk: { '>=': null } },
            { limit: 1 },
          );

          expect(result.items.length).toBe(1);
        }),
      );

      itEffect('queries with sk comparison', () =>
        Effect.gen(function* () {
          // Query for orders >= order-001 (ascending, so should get both)
          // SK is the idField (orderId) for primary index
          const result = yield* OrderEntity.query(
            'primary',
            {
              pk: { userId: 'query-user-1' },
              sk: { '>=': 'order-001' },
            },
            { limit: 10 },
          );

          expect(result.items.length).toBe(2);
        }),
      );
    });

    describe('index queries', () => {
      itEffect('queries by GSI', () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: 'gsi-user-1',
            name: 'GSI Test User',
            email: 'gsi-test@example.com',
            status: 'active',
            age: 28,
          });

          const result = yield* UserEntity.query('byEmail', {
            pk: { email: 'gsi-test@example.com' },
            sk: { '>=': null },
          });

          expect(result.items.length).toBe(1);
          expect(result.items[0]?.value.name).toBe('GSI Test User');
        }),
      );

      itEffect('queries by status GSI', () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: 'status-user-1',
            name: 'Status User 1',
            email: 'status1@example.com',
            status: 'verified',
            age: 30,
          });
          yield* UserEntity.insert({
            userId: 'status-user-2',
            name: 'Status User 2',
            email: 'status2@example.com',
            status: 'verified',
            age: 25,
          });

          const result = yield* UserEntity.query('byStatus', {
            pk: { status: 'verified' },
            sk: { '>=': null },
          });

          expect(result.items.length).toBe(2);
        }),
      );
    });

    describe('transactions', () => {
      itEffect('executes entity operations in transaction', () =>
        Effect.gen(function* () {
          const insertOp = yield* UserEntity.insertOp({
            userId: 'txn-entity-1',
            name: 'Txn User 1',
            email: 'txn1@example.com',
            status: 'active',
            age: 30,
          });

          const insertOp2 = yield* UserEntity.insertOp({
            userId: 'txn-entity-2',
            name: 'Txn User 2',
            email: 'txn2@example.com',
            status: 'active',
            age: 25,
          });

          yield* table.transact([insertOp, insertOp2]);

          const user1 = yield* UserEntity.get({
            userId: 'txn-entity-1',
          });
          const user2 = yield* UserEntity.get({
            userId: 'txn-entity-2',
          });

          expect(user1).not.toBeNull();
          expect(user2).not.toBeNull();
        }),
      );

      itEffect('executes mixed insert and update operations', () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: 'txn-existing-1',
            name: 'Existing User',
            email: 'existing@example.com',
            status: 'pending',
            age: 40,
          });

          const insertOp = yield* UserEntity.insertOp({
            userId: 'txn-new-1',
            name: 'New User',
            email: 'new@example.com',
            status: 'active',
            age: 22,
          });

          const updateOp = yield* UserEntity.updateOp(
            { userId: 'txn-existing-1' },
            { update: { status: 'verified' } },
          );

          yield* table.transact([insertOp, updateOp]);

          const newUser = yield* UserEntity.get({
            userId: 'txn-new-1',
          });
          const existingUser = yield* UserEntity.get({
            userId: 'txn-existing-1',
          });

          expect(newUser).not.toBeNull();
          expect(existingUser?.value.status).toBe('verified');
        }),
      );
    });

    describe('query with sort key conditions', () => {
      beforeAll(async () => {
        await Effect.runPromise(
          Effect.gen(function* () {
            yield* OrderEntity.insert({
              orderId: 'order-001',
              userId: 'entity-query-sk-user',
              total: 100,
              status: 'pending',
              items: [],
            });
            yield* OrderEntity.insert({
              orderId: 'order-002',
              userId: 'entity-query-sk-user',
              total: 200,
              status: 'completed',
              items: [],
            });
            yield* OrderEntity.insert({
              orderId: 'order-003',
              userId: 'entity-query-sk-user',
              total: 300,
              status: 'cancelled',
              items: [],
            });
          }),
        );
      });

      itEffect('queries entities with sk comparison', () =>
        Effect.gen(function* () {
          // Simplified query uses KeyOp with comparison operators
          // SK is the idField (orderId) for primary index
          const result = yield* OrderEntity.query('primary', {
            pk: { userId: 'entity-query-sk-user' },
            sk: { '>': 'order-001' },
          });

          expect(result.items.length).toBe(2);
        }),
      );
    });
  });

  describe('Expression Module Integration', () => {
    describe('conditionExpr', () => {
      itEffect('filters with attributeExists', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'COND_EXPR#1',
            sk: 'ITEM#1',
            optionalField: 'exists',
          });
          yield* table.putItem({
            pk: 'COND_EXPR#1',
            sk: 'ITEM#2',
            // optionalField not present
          });

          const condition = exprCondition<{ optionalField?: string }>(($) =>
            $.attributeExists('optionalField'),
          );
          const exprResult = buildExpr({ condition });

          // Try to update item with condition - should succeed for ITEM#1
          const update = exprUpdate<{ status: string }>(($) => [
            $.set('status', 'updated'),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'COND_EXPR#1', sk: 'ITEM#1' },
            {
              ...updateExprResult,
              ConditionExpression: exprResult.ConditionExpression,
              ExpressionAttributeNames: {
                ...updateExprResult.ExpressionAttributeNames,
                ...exprResult.ExpressionAttributeNames,
              },
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.status).toBe('updated');
        }),
      );

      itEffect('filters with attributeNotExists', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'COND_EXPR#2',
            sk: 'ITEM#1',
            // noField not present - condition should pass
          });

          const condition = exprCondition<{ noField?: string }>(($) =>
            $.attributeNotExists('noField'),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ noField: string }>(($) => [
            $.set('noField', 'created'),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'COND_EXPR#2', sk: 'ITEM#1' },
            {
              ...updateExprResult,
              ConditionExpression: exprResult.ConditionExpression,
              ExpressionAttributeNames: {
                ...updateExprResult.ExpressionAttributeNames,
                ...exprResult.ExpressionAttributeNames,
              },
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.noField).toBe('created');
        }),
      );

      itEffect('filters with not equals (<>)', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'COND_EXPR#3',
            sk: 'ITEM#1',
            status: 'active',
          });

          const condition = exprCondition<{ status: string }>(($) =>
            $.cond('status', '<>', 'inactive'),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ count: number }>(($) => [
            $.set('count', 1),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'COND_EXPR#3', sk: 'ITEM#1' },
            {
              ...updateExprResult,
              ConditionExpression: exprResult.ConditionExpression,
              ExpressionAttributeNames: {
                ...updateExprResult.ExpressionAttributeNames,
                ...exprResult.ExpressionAttributeNames,
              },
              ExpressionAttributeValues: {
                ...updateExprResult.ExpressionAttributeValues,
                ...exprResult.ExpressionAttributeValues,
              },
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.count).toBe(1);
        }),
      );

      itEffect('filters with nested AND conditions', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'COND_EXPR#4',
            sk: 'ITEM#1',
            status: 'active',
            count: 10,
          });

          const condition = exprCondition<{ status: string; count: number }>(
            ($) =>
              $.and($.cond('status', '=', 'active'), $.cond('count', '>=', 5)),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ verified: boolean }>(($) => [
            $.set('verified', true),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'COND_EXPR#4', sk: 'ITEM#1' },
            {
              ...updateExprResult,
              ConditionExpression: exprResult.ConditionExpression,
              ExpressionAttributeNames: {
                ...updateExprResult.ExpressionAttributeNames,
                ...exprResult.ExpressionAttributeNames,
              },
              ExpressionAttributeValues: {
                ...updateExprResult.ExpressionAttributeValues,
                ...exprResult.ExpressionAttributeValues,
              },
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.verified).toBe(true);
        }),
      );

      itEffect('filters with nested OR conditions', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'COND_EXPR#5',
            sk: 'ITEM#1',
            status: 'pending',
            priority: 'low',
          });

          const condition = exprCondition<{ status: string; priority: string }>(
            ($) =>
              $.or(
                $.cond('status', '=', 'active'),
                $.cond('priority', '=', 'low'),
              ),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ processed: boolean }>(($) => [
            $.set('processed', true),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'COND_EXPR#5', sk: 'ITEM#1' },
            {
              ...updateExprResult,
              ConditionExpression: exprResult.ConditionExpression,
              ExpressionAttributeNames: {
                ...updateExprResult.ExpressionAttributeNames,
                ...exprResult.ExpressionAttributeNames,
              },
              ExpressionAttributeValues: {
                ...updateExprResult.ExpressionAttributeValues,
                ...exprResult.ExpressionAttributeValues,
              },
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.processed).toBe(true);
        }),
      );

      itEffect('filters with complex AND/OR combination', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'COND_EXPR#6',
            sk: 'ITEM#1',
            type: 'order',
            status: 'pending',
            total: 500,
          });

          const condition = exprCondition<{
            type: string;
            status: string;
            total: number;
          }>(($) =>
            $.and(
              $.cond('type', '=', 'order'),
              $.or(
                $.cond('status', '=', 'completed'),
                $.cond('total', '>=', 100),
              ),
            ),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ flagged: boolean }>(($) => [
            $.set('flagged', true),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'COND_EXPR#6', sk: 'ITEM#1' },
            {
              ...updateExprResult,
              ConditionExpression: exprResult.ConditionExpression,
              ExpressionAttributeNames: {
                ...updateExprResult.ExpressionAttributeNames,
                ...exprResult.ExpressionAttributeNames,
              },
              ExpressionAttributeValues: {
                ...updateExprResult.ExpressionAttributeValues,
                ...exprResult.ExpressionAttributeValues,
              },
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.flagged).toBe(true);
        }),
      );

      itEffect('compares two fields using ref()', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'COND_EXPR#7',
            sk: 'ITEM#1',
            score: 80,
            threshold: 50,
          });

          yield* table.putItem({
            pk: 'COND_EXPR#7',
            sk: 'ITEM#2',
            score: 30,
            threshold: 50,
          });

          const filter = exprFilter<{ score: number; threshold: number }>(($) =>
            $.cond('score', '>', $.ref('threshold')),
          );

          const result = yield* table.query({ pk: 'COND_EXPR#7' }, { filter });

          expect(result.Items).toHaveLength(1);
          expect(result.Items?.[0]?.sk).toBe('ITEM#1');
        }),
      );
    });

    describe('updateExpr', () => {
      itEffect('sets with ifNotExists', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'UPDATE_EXPR#1',
            sk: 'ITEM#1',
            // counter not present
          });

          const update = exprUpdate<{ counter: number }>(($) => [
            $.set('counter', $.opIfNotExists('counter', 0)),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'UPDATE_EXPR#1', sk: 'ITEM#1' },
            {
              ...exprResult,
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.counter).toBe(0);

          // Update again - should keep the value
          const result2 = yield* table.updateItem(
            { pk: 'UPDATE_EXPR#1', sk: 'ITEM#1' },
            {
              ...exprResult,
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result2.Attributes?.counter).toBe(0);
        }),
      );

      itEffect('appends to array', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'UPDATE_EXPR#2',
            sk: 'ITEM#1',
            tags: ['initial'],
          });

          const update = exprUpdate<{ tags: string[] }>(($) => [
            $.append('tags', ['new-tag', 'another-tag']),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'UPDATE_EXPR#2', sk: 'ITEM#1' },
            {
              ...exprResult,
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.tags).toEqual([
            'initial',
            'new-tag',
            'another-tag',
          ]);
        }),
      );

      itEffect('prepends to array', () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: 'UPDATE_EXPR#3',
            sk: 'ITEM#1',
            logs: ['existing-log'],
          });

          const update = exprUpdate<{ logs: string[] }>(($) => [
            $.prepend('logs', ['first-log']),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: 'UPDATE_EXPR#3', sk: 'ITEM#1' },
            {
              ...exprResult,
              ReturnValues: 'ALL_NEW',
            },
          );

          expect(result.Attributes?.logs).toEqual([
            'first-log',
            'existing-log',
          ]);
        }),
      );
    });

    describe('filterExpr with query', () => {
      beforeAll(async () => {
        await Effect.runPromise(
          Effect.gen(function* () {
            yield* table.putItem({
              pk: 'FILTER_QUERY#1',
              sk: 'ITEM#1',
              status: 'active',
              score: 100,
            });
            yield* table.putItem({
              pk: 'FILTER_QUERY#1',
              sk: 'ITEM#2',
              status: 'inactive',
              score: 200,
            });
            yield* table.putItem({
              pk: 'FILTER_QUERY#1',
              sk: 'ITEM#3',
              status: 'active',
              score: 300,
            });
          }),
        );
      });

      itEffect('queries with filter expression', () =>
        Effect.gen(function* () {
          // table.query expects filter as a ConditionOperation, not compiled
          const filter = exprFilter<{ status: string }>(($) =>
            $.cond('status', '=', 'active'),
          );

          const result = yield* table.query(
            { pk: 'FILTER_QUERY#1' },
            { filter },
          );

          expect(result.Items.length).toBe(2);
          expect(result.Items.every((i) => i.status === 'active')).toBe(true);
        }),
      );

      itEffect('queries with complex filter expression', () =>
        Effect.gen(function* () {
          // table.query expects filter as a ConditionOperation, not compiled
          const filter = exprFilter<{ status: string; score: number }>(($) =>
            $.and($.cond('status', '=', 'active'), $.cond('score', '>', 150)),
          );

          const result = yield* table.query(
            { pk: 'FILTER_QUERY#1' },
            { filter },
          );

          expect(result.Items.length).toBe(1);
          expect(result.Items[0]?.score).toBe(300);
        }),
      );
    });
  });

  describe('Edge Cases', () => {
    itEffect('handles special characters in keys', () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'SPECIAL@CHARS#1',
          sk: 'ITEM:WITH:COLONS#123',
          data: 'special-data',
        });

        const result = yield* table.getItem({
          pk: 'SPECIAL@CHARS#1',
          sk: 'ITEM:WITH:COLONS#123',
        });

        expect(result.Item).not.toBeNull();
        expect(result.Item?.data).toBe('special-data');
      }),
    );

    itEffect('returns empty array for query with no results', () =>
      Effect.gen(function* () {
        const result = yield* table.query({
          pk: 'NONEXISTENT_PK#999',
        });

        expect(result.Items).toEqual([]);
        expect(result.Items.length).toBe(0);
      }),
    );

    itEffect('updates nested object paths', () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: 'NESTED#1',
          sk: 'ITEM#1',
          config: {
            theme: 'light',
            notifications: true,
          },
        });

        const update = exprUpdate<{ config: { theme: string } }>(($) => [
          $.set('config.theme', 'dark'),
        ]);
        const exprResult = buildExpr({ update });

        const result = yield* table.updateItem(
          { pk: 'NESTED#1', sk: 'ITEM#1' },
          {
            ...exprResult,
            ReturnValues: 'ALL_NEW',
          },
        );

        expect((result.Attributes?.config as any)?.theme).toBe('dark');
        expect((result.Attributes?.config as any)?.notifications).toBe(true);
      }),
    );
  });

  describe('custom SK indexes', () => {
    itEffect('queries with custom SK field', () =>
      Effect.gen(function* () {
        yield* ProductEntity.insert({
          productId: 'prod-1',
          category: 'electronics',
          name: 'Alpha Widget',
          price: 29.99,
        });
        yield* ProductEntity.insert({
          productId: 'prod-2',
          category: 'electronics',
          name: 'Beta Gadget',
          price: 49.99,
        });
        yield* ProductEntity.insert({
          productId: 'prod-3',
          category: 'electronics',
          name: 'Gamma Device',
          price: 19.99,
        });

        // Query all products in category by name ascending
        const allAsc = yield* ProductEntity.query('byName', {
          pk: { category: 'electronics' },
          sk: { '>=': null },
        });
        expect(allAsc.items.length).toBe(3);
        expect(allAsc.items[0]?.value.name).toBe('Alpha Widget');
        expect(allAsc.items[2]?.value.name).toBe('Gamma Device');

        // Query products with name > "Beta Gadget"
        const afterBeta = yield* ProductEntity.query('byName', {
          pk: { category: 'electronics' },
          sk: { '>': { name: 'Beta Gadget' } },
        });
        expect(afterBeta.items.length).toBe(1);
        expect(afterBeta.items[0]?.value.name).toBe('Gamma Device');

        // Query products with name <= "Beta Gadget" descending
        const beforeBetaDesc = yield* ProductEntity.query('byName', {
          pk: { category: 'electronics' },
          sk: { '<=': { name: 'Beta Gadget' } },
        });
        expect(beforeBetaDesc.items.length).toBe(2);
        expect(beforeBetaDesc.items[0]?.value.name).toBe('Beta Gadget');
        expect(beforeBetaDesc.items[1]?.value.name).toBe('Alpha Widget');
      }),
    );

    itEffect('default SK index still works alongside custom SK index', () =>
      Effect.gen(function* () {
        // byCategoryDefault uses _u SK (default)
        const result = yield* ProductEntity.query('byCategoryDefault', {
          pk: { category: 'electronics' },
          sk: { '>=': null },
        });
        expect(result.items.length).toBeGreaterThanOrEqual(3);
      }),
    );

    itEffect('queryStream works with custom SK index', () =>
      Effect.gen(function* () {
        const stream = ProductEntity.queryStream(
          'byName',
          {
            pk: { category: 'electronics' },
            sk: { '>': null },
          },
          { batchSize: 2 },
        );
        const chunks = yield* stream.pipe(
          Stream.runCollect,
          Effect.map((c) => Array.from(c).flat()),
        );
        expect(chunks.length).toBeGreaterThanOrEqual(3);
      }),
    );
  });

  describe('EntityRegistry with single entities', () => {
    const settingsSchema = SingleEntityESchema.make('Settings', {
      darkMode: Schema.Boolean,
      language: Schema.String,
    }).build();

    const Settings = DynamoSingleEntity.make(table)
      .eschema(settingsSchema)
      .default({ darkMode: false, language: 'en' });

    const registry = EntityRegistry.make(table)
      .register(UserEntity)
      .registerSingle(Settings)
      .build();

    it('provides access to single entity via singleEntity()', () => {
      const s = registry.singleEntity('Settings');
      expect(s.name).toBe('Settings');
    });

    it('includes single entity names in entityNames', () => {
      const names = registry.entityNames;
      expect(names).toContain('User');
      expect(names).toContain('Settings');
    });

    it('getSchema excludes single entities', () => {
      const schema = registry.getSchema();
      const descriptorNames = schema.descriptors.map(
        (d) => (d as any).entityName,
      );
      expect(descriptorNames).not.toContain('Settings');
    });

    itEffect(
      'executes transaction with both entity and single entity ops',
      () =>
        Effect.gen(function* () {
          yield* Settings.put({ darkMode: false, language: 'en' });

          const insertOp = yield* UserEntity.insertOp({
            userId: 'registry-txn-1',
            name: 'Registry Txn User',
            email: 'reg-txn@example.com',
            status: 'active',
            age: 28,
          });

          const updateOp = yield* Settings.updateOp({
            update: { darkMode: true },
          });

          yield* registry.transact([insertOp, updateOp]);

          const user = yield* UserEntity.get({ userId: 'registry-txn-1' });
          expect(user).not.toBeNull();
          expect(user?.value.name).toBe('Registry Txn User');

          const settings = yield* Settings.get();
          expect(settings.value.darkMode).toBe(true);
        }),
    );
  });
});
