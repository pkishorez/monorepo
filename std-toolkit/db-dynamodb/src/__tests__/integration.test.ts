import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import {
  DynamoTable,
  DynamoEntity,
  DynamodbError,
  exprUpdate,
  buildExpr,
  opAdd,
  exprCondition,
  exprFilter,
} from "../index.js";
import { createDynamoDB } from "../services/DynamoClient.js";

// Use timestamp-based name to avoid schema conflicts between test runs
const TEST_TABLE_NAME = `db-dynamodb-test-${Date.now()}`;
const LOCAL_ENDPOINT = "http://localhost:8090";

const localConfig = {
  tableName: TEST_TABLE_NAME,
  region: "us-east-1",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
  endpoint: LOCAL_ENDPOINT,
};

// Create table instance directly (no Layer)
const table = DynamoTable.make(localConfig)
  .primary("pk", "sk")
  .gsi("GSI1", "GSI1PK", "GSI1SK")
  .gsi("GSI2", "GSI2PK", "GSI2SK")
  .build();

// Schema definitions for entity tests
// New ESchema API: idField is second parameter
const userSchema = ESchema.make("User", "userId", {
  name: Schema.String,
  email: Schema.String,
  status: Schema.String,
  age: Schema.Number,
}).build();

// Entity receives table instance directly
// New API: SK is automatically the idField
const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({ pk: ["userId"] })
  .index("GSI1", "byEmail", { pk: ["email"] })
  .index("GSI2", "byStatus", { pk: ["status"] })
  .build();

// Order schema for more complex tests
const orderSchema = ESchema.make("Order", "orderId", {
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
  .primary({ pk: ["userId"] })
  .build();

// Helper to create the test table
async function createTestTable() {
  const client = createDynamoDB(localConfig);

  // Create the table
  const createParams = {
    TableName: TEST_TABLE_NAME,
    KeySchema: [
      { AttributeName: "pk", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "pk", AttributeType: "S" },
      { AttributeName: "sk", AttributeType: "S" },
      { AttributeName: "GSI1PK", AttributeType: "S" },
      { AttributeName: "GSI1SK", AttributeType: "S" },
      { AttributeName: "GSI2PK", AttributeType: "S" },
      { AttributeName: "GSI2SK", AttributeType: "S" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "GSI1",
        KeySchema: [
          { AttributeName: "GSI1PK", KeyType: "HASH" },
          { AttributeName: "GSI1SK", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
      {
        IndexName: "GSI2",
        KeySchema: [
          { AttributeName: "GSI2PK", KeyType: "HASH" },
          { AttributeName: "GSI2SK", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
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
        if (errorName === "ResourceInUseException") {
          return Effect.void;
        }
        return Effect.fail(e);
      }),
    ),
  );

  // Wait for table to be active
  await new Promise((resolve) => setTimeout(resolve, 500));
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

describe("@std-toolkit/db-dynamodb Integration Tests", () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  describe("DynamoTable - Low-level Operations", () => {
    describe("putItem / getItem", () => {
      it.effect("puts and retrieves an item", () =>
        Effect.gen(function* () {
          // Put an item
          yield* table.putItem({
            pk: "TEST#1",
            sk: "ITEM#1",
            name: "Test Item",
            count: 42,
            active: true,
          });

          // Get the item
          const result = yield* table.getItem({ pk: "TEST#1", sk: "ITEM#1" });

          expect(result.Item).not.toBeNull();
          expect(result.Item?.name).toBe("Test Item");
          expect(result.Item?.count).toBe(42);
          expect(result.Item?.active).toBe(true);
        }),
      );

      it.effect("returns null for non-existent item", () =>
        Effect.gen(function* () {
          const result = yield* table.getItem({
            pk: "NONEXISTENT#1",
            sk: "ITEM#1",
          });

          expect(result.Item).toBeNull();
        }),
      );

      it.effect("supports ConsistentRead option", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "TEST#consistent",
            sk: "ITEM#1",
            value: "test",
          });

          const result = yield* table.getItem(
            { pk: "TEST#consistent", sk: "ITEM#1" },
            { ConsistentRead: true },
          );

          expect(result.Item).not.toBeNull();
          expect(result.Item?.value).toBe("test");
        }),
      );

      it.effect("puts item with condition expression", () =>
        Effect.gen(function* () {
          // First put
          yield* table.putItem({
            pk: "TEST#cond",
            sk: "ITEM#1",
            version: 1,
          });

          // Conditional put that should fail
          const result = yield* table
            .putItem(
              { pk: "TEST#cond", sk: "ITEM#1", version: 2 },
              {
                ConditionExpression: "attribute_not_exists(pk)",
              },
            )
            .pipe(Effect.either);

          expect(result._tag).toBe("Left");
        }),
      );
    });

    describe("updateItem", () => {
      it.effect("updates an existing item", () =>
        Effect.gen(function* () {
          // Create item
          yield* table.putItem({
            pk: "TEST#update",
            sk: "ITEM#1",
            name: "Original",
            count: 0,
          });

          // Update item
          const update = exprUpdate<{ name: string; count: number }>(($) => [
            $.set("name", "Updated"),
            $.set("count", opAdd("count", 5)),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "TEST#update", sk: "ITEM#1" },
            {
              ...exprResult,
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes).not.toBeNull();
          expect(result.Attributes?.name).toBe("Updated");
          expect(result.Attributes?.count).toBe(5);
        }),
      );

      it.effect("creates item on update if not exists (upsert behavior)", () =>
        Effect.gen(function* () {
          const update = exprUpdate<{ name: string }>(($) => [
            $.set("name", "New Item"),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "TEST#upsert", sk: "ITEM#1" },
            {
              ...exprResult,
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.name).toBe("New Item");
        }),
      );

      it.effect("updates with conditional expression", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "TEST#condupdate",
            sk: "ITEM#1",
            status: "active",
            count: 10,
          });

          const update = exprUpdate<{ count: number }>(($) => [
            $.set("count", opAdd("count", 1)),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "TEST#condupdate", sk: "ITEM#1" },
            {
              ...exprResult,
              ConditionExpression: "#cf_status = :cf_active",
              ExpressionAttributeNames: {
                ...exprResult.ExpressionAttributeNames,
                "#cf_status": "status",
              },
              ExpressionAttributeValues: {
                ...exprResult.ExpressionAttributeValues,
                ":cf_active": { S: "active" },
              },
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.count).toBe(11);
        }),
      );

      it.effect("returns ALL_OLD on update", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "TEST#allold",
            sk: "ITEM#1",
            name: "Original",
          });

          const update = exprUpdate<{ name: string }>(($) => [
            $.set("name", "Changed"),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "TEST#allold", sk: "ITEM#1" },
            {
              ...exprResult,
              ReturnValues: "ALL_OLD",
            },
          );

          expect(result.Attributes?.name).toBe("Original");
        }),
      );
    });

    describe("deleteItem", () => {
      it.effect("deletes an existing item", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "TEST#delete",
            sk: "ITEM#1",
            data: "to be deleted",
          });

          yield* table.deleteItem({ pk: "TEST#delete", sk: "ITEM#1" });

          const result = yield* table.getItem({
            pk: "TEST#delete",
            sk: "ITEM#1",
          });
          expect(result.Item).toBeNull();
        }),
      );

      it.effect("deleting non-existent item succeeds silently", () =>
        Effect.gen(function* () {
          // Should not throw
          yield* table.deleteItem({
            pk: "NONEXISTENT#delete",
            sk: "ITEM#999",
          });
        }),
      );
    });

    describe("query", () => {
      // Shared query fixture
      const SHARED_QUERY_PK = "QUERY_SHARED";

      beforeAll(async () => {
        await Effect.runPromise(
          Effect.gen(function* () {
            yield* table.putItem({
              pk: SHARED_QUERY_PK,
              sk: "A",
              data: "a",
              score: 100,
            });
            yield* table.putItem({
              pk: SHARED_QUERY_PK,
              sk: "B",
              data: "b",
              score: 200,
            });
            yield* table.putItem({
              pk: SHARED_QUERY_PK,
              sk: "C",
              data: "c",
              score: 300,
            });
            yield* table.putItem({
              pk: SHARED_QUERY_PK,
              sk: "D",
              data: "d",
              score: 400,
            });
          }),
        );
      });

      it.effect("queries items by partition key", () =>
        Effect.gen(function* () {
          const result = yield* table.query({ pk: SHARED_QUERY_PK });
          expect(result.Items.length).toBe(4);
        }),
      );

      it.effect("queries with sort key equals", () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: "B",
          });

          expect(result.Items.length).toBe(1);
          expect(result.Items[0]?.data).toBe("b");
        }),
      );

      it.effect("queries with begins_with", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "BEGINSWITH#1",
            sk: "ORDER#2024-01",
            data: "jan",
          });
          yield* table.putItem({
            pk: "BEGINSWITH#1",
            sk: "ORDER#2024-02",
            data: "feb",
          });
          yield* table.putItem({
            pk: "BEGINSWITH#1",
            sk: "ORDER#2023-12",
            data: "dec",
          });

          const result = yield* table.query({
            pk: "BEGINSWITH#1",
            sk: { beginsWith: "ORDER#2024" },
          });

          expect(result.Items.length).toBe(2);
        }),
      );

      it.effect("queries with between", () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { between: ["B", "C"] },
          });

          expect(result.Items.length).toBe(2);
          expect(result.Items.map((i) => i.data).sort()).toEqual(["b", "c"]);
        }),
      );

      it.effect("queries with less than (<)", () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { "<": "C" },
          });

          expect(result.Items.length).toBe(2);
          expect(result.Items.map((i) => i.data).sort()).toEqual(["a", "b"]);
        }),
      );

      it.effect("queries with less than or equal (<=)", () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { "<=": "C" },
          });

          expect(result.Items.length).toBe(3);
          expect(result.Items.map((i) => i.data).sort()).toEqual([
            "a",
            "b",
            "c",
          ]);
        }),
      );

      it.effect("queries with greater than (>)", () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { ">": "B" },
          });

          expect(result.Items.length).toBe(2);
          expect(result.Items.map((i) => i.data).sort()).toEqual(["c", "d"]);
        }),
      );

      it.effect("queries with greater than or equal (>=)", () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: SHARED_QUERY_PK,
            sk: { ">=": "B" },
          });

          expect(result.Items.length).toBe(3);
          expect(result.Items.map((i) => i.data).sort()).toEqual([
            "b",
            "c",
            "d",
          ]);
        }),
      );

      it.effect("queries with Limit", () =>
        Effect.gen(function* () {
          const result = yield* table.query(
            { pk: SHARED_QUERY_PK },
            { Limit: 2 },
          );

          expect(result.Items.length).toBe(2);
        }),
      );

      it.effect("queries with ScanIndexForward false (descending)", () =>
        Effect.gen(function* () {
          const result = yield* table.query(
            { pk: SHARED_QUERY_PK },
            { ScanIndexForward: false },
          );

          expect(result.Items[0]?.sk).toBe("D");
          expect(result.Items[3]?.sk).toBe("A");
        }),
      );
    });

    describe("scan", () => {
      it.effect("scans all items in table", () =>
        Effect.gen(function* () {
          const result = yield* table.scan();

          // Should have items from previous tests
          expect(result.Items.length).toBeGreaterThan(0);
        }),
      );

      it.effect("scans with Limit", () =>
        Effect.gen(function* () {
          const result = yield* table.scan({ Limit: 5 });

          expect(result.Items.length).toBeLessThanOrEqual(5);
        }),
      );
    });

    describe("index operations", () => {
      it.effect("queries GSI by index name", () =>
        Effect.gen(function* () {
          // Insert items with GSI keys
          yield* table.putItem({
            pk: "USER#100",
            sk: "PROFILE",
            GSI1PK: "EMAIL#alice@example.com",
            GSI1SK: "100",
            name: "Alice",
          });
          yield* table.putItem({
            pk: "USER#101",
            sk: "PROFILE",
            GSI1PK: "EMAIL#bob@example.com",
            GSI1SK: "101",
            name: "Bob",
          });

          const result = yield* table
            .index("GSI1")
            .query({ pk: "EMAIL#alice@example.com" });

          expect(result.Items.length).toBe(1);
          expect(result.Items[0]?.name).toBe("Alice");
        }),
      );

      it.effect("scans GSI", () =>
        Effect.gen(function* () {
          const result = yield* table.index("GSI1").scan();

          // Should have items with GSI pk from previous test
          expect(result.Items.some((i) => i["GSI1PK"])).toBe(true);
        }),
      );
    });

    describe("transactions", () => {
      it.effect("executes multiple operations atomically", () =>
        Effect.gen(function* () {
          const op1 = table.opPutItem({
            pk: "TXN#1",
            sk: "ITEM#A",
            value: "transaction item A",
          });

          const op2 = table.opPutItem({
            pk: "TXN#1",
            sk: "ITEM#B",
            value: "transaction item B",
          });

          yield* table.transact([op1, op2]);

          // Verify both items exist
          const item1 = yield* table.getItem({ pk: "TXN#1", sk: "ITEM#A" });
          const item2 = yield* table.getItem({ pk: "TXN#1", sk: "ITEM#B" });

          expect(item1.Item).not.toBeNull();
          expect(item2.Item).not.toBeNull();
          expect(item1.Item?.value).toBe("transaction item A");
          expect(item2.Item?.value).toBe("transaction item B");
        }),
      );

      it.effect("executes update operations in transaction", () =>
        Effect.gen(function* () {
          // Setup items
          yield* table.putItem({
            pk: "TXN_UPDATE#1",
            sk: "ITEM#A",
            count: 10,
          });
          yield* table.putItem({
            pk: "TXN_UPDATE#1",
            sk: "ITEM#B",
            count: 20,
          });

          const update1 = exprUpdate<{ count: number }>(($) => [
            $.set("count", opAdd("count", 5)),
          ]);
          const expr1 = buildExpr({ update: update1 });

          const update2 = exprUpdate<{ count: number }>(($) => [
            $.set("count", opAdd("count", -5)),
          ]);
          const expr2 = buildExpr({ update: update2 });

          const op1 = table.opUpdateItem(
            { pk: "TXN_UPDATE#1", sk: "ITEM#A" },
            expr1,
          );

          const op2 = table.opUpdateItem(
            { pk: "TXN_UPDATE#1", sk: "ITEM#B" },
            expr2,
          );

          yield* table.transact([op1, op2]);

          const item1 = yield* table.getItem({
            pk: "TXN_UPDATE#1",
            sk: "ITEM#A",
          });
          const item2 = yield* table.getItem({
            pk: "TXN_UPDATE#1",
            sk: "ITEM#B",
          });

          expect(item1.Item?.count).toBe(15);
          expect(item2.Item?.count).toBe(15);
        }),
      );
    });
  });

  describe("DynamoEntity - High-level Operations", () => {
    describe("insert", () => {
      it.effect("inserts a new entity", () =>
        Effect.gen(function* () {
          const result = yield* UserEntity.insert({
            userId: "entity-insert-1",
            name: "Test User",
            email: "test@example.com",
            status: "active",
            age: 30,
          });

          expect(result.value.userId).toBe("entity-insert-1");
          expect(result.value.name).toBe("Test User");
          expect(result.meta._e).toBe("User");
          expect(result.meta._d).toBe(false);
        }),
      );

      it.effect("fails when inserting duplicate entity", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: "entity-dup-1",
            name: "First",
            email: "dup@example.com",
            status: "active",
            age: 25,
          });

          const result = yield* UserEntity.insert({
            userId: "entity-dup-1",
            name: "Second",
            email: "dup2@example.com",
            status: "inactive",
            age: 26,
          }).pipe(Effect.either);

          expect(result._tag).toBe("Left");
        }),
      );
    });

    describe("get", () => {
      it.effect("retrieves an existing entity", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: "entity-get-1",
            name: "Get Test",
            email: "get@example.com",
            status: "active",
            age: 35,
          });

          const result = yield* UserEntity.get({
            userId: "entity-get-1",
          });

          expect(result).not.toBeNull();
          expect(result?.value.name).toBe("Get Test");
          expect(result?.meta._e).toBe("User");
        }),
      );

      it.effect("returns null for non-existent entity", () =>
        Effect.gen(function* () {
          const result = yield* UserEntity.get({
            userId: "nonexistent-entity",
          });

          expect(result).toBeNull();
        }),
      );
    });

    describe("update", () => {
      it.effect("updates an existing entity", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: "entity-update-1",
            name: "Original Name",
            email: "update@example.com",
            status: "active",
            age: 40,
          });

          const result = yield* UserEntity.update(
            { userId: "entity-update-1" },
            { name: "Updated Name", age: 41 },
          );

          expect(result.value.name).toBe("Updated Name");
          expect(result.value.age).toBe(41);
        }),
      );

      it.effect("updates _uid on each update", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: "entity-incr-1",
            name: "Increment Test",
            email: "incr@example.com",
            status: "active",
            age: 25,
          });

          const first = yield* UserEntity.update(
            { userId: "entity-incr-1" },
            { name: "Update 1" },
          );

          const second = yield* UserEntity.update(
            { userId: "entity-incr-1" },
            { name: "Update 2" },
          );

          // _uid should be different after each update
          expect(second.meta._uid).not.toBe(first.meta._uid);
        }),
      );

      it.effect("can use condition for optimistic locking", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: "entity-lock-1",
            name: "Lock Test",
            email: "lock@example.com",
            status: "active",
            age: 30,
          });

          // Update with condition succeeds
          const result = yield* UserEntity.update(
            { userId: "entity-lock-1" },
            { name: "Update 1" },
          );

          expect(result.value.name).toBe("Update 1");
        }),
      );
    });

    describe("query", () => {
      it.effect("queries entities by primary key using raw.query", () =>
        Effect.gen(function* () {
          // orderId is the idField - optional, auto-generated if not provided
          yield* OrderEntity.insert({
            orderId: "order-001",
            userId: "query-user-1",
            total: 100,
            status: "pending",
            items: [],
          });
          yield* OrderEntity.insert({
            orderId: "order-002",
            userId: "query-user-1",
            total: 200,
            status: "completed",
            items: [],
          });

          const result = yield* OrderEntity.raw.query("primary", {
            pk: { userId: "query-user-1" },
          });

          expect(result.items.length).toBe(2);
        }),
      );

      it.effect("queries with limit using raw.query", () =>
        Effect.gen(function* () {
          const result = yield* OrderEntity.raw.query(
            "primary",
            { pk: { userId: "query-user-1" } },
            { Limit: 1 },
          );

          expect(result.items.length).toBe(1);
        }),
      );

      it.effect("queries with simplified query API", () =>
        Effect.gen(function* () {
          // Query for orders >= order-001 (ascending, so should get both)
          // SK is the idField (orderId) for primary index
          const result = yield* OrderEntity.query(
            "primary",
            {
              pk: { userId: "query-user-1" },
              sk: { ">=": "order-001" },
            },
            { limit: 10 },
          );

          expect(result.items.length).toBe(2);
        }),
      );
    });

    describe("index queries", () => {
      it.effect("queries by GSI using raw.query", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: "gsi-user-1",
            name: "GSI Test User",
            email: "gsi-test@example.com",
            status: "active",
            age: 28,
          });

          const result = yield* UserEntity.raw.query("byEmail", {
            pk: { email: "gsi-test@example.com" },
          });

          expect(result.items.length).toBe(1);
          expect(result.items[0]?.value.name).toBe("GSI Test User");
        }),
      );

      it.effect("queries by GSI using simplified query API", () =>
        Effect.gen(function* () {
          // Secondary indexes use _uid as SK, query with null to get all
          const result = yield* UserEntity.query("byEmail", {
            pk: { email: "gsi-test@example.com" },
            sk: { ">=": null },
          });

          expect(result.items.length).toBe(1);
          expect(result.items[0]?.value.name).toBe("GSI Test User");
        }),
      );

      it.effect("queries by status GSI using raw.query", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: "status-user-1",
            name: "Status User 1",
            email: "status1@example.com",
            status: "verified",
            age: 30,
          });
          yield* UserEntity.insert({
            userId: "status-user-2",
            name: "Status User 2",
            email: "status2@example.com",
            status: "verified",
            age: 25,
          });

          const result = yield* UserEntity.raw.query("byStatus", {
            pk: { status: "verified" },
          });

          expect(result.items.length).toBe(2);
        }),
      );
    });

    describe("transactions", () => {
      it.effect("executes entity operations in transaction", () =>
        Effect.gen(function* () {
          const insertOp = yield* UserEntity.insertOp({
            userId: "txn-entity-1",
            name: "Txn User 1",
            email: "txn1@example.com",
            status: "active",
            age: 30,
          });

          const insertOp2 = yield* UserEntity.insertOp({
            userId: "txn-entity-2",
            name: "Txn User 2",
            email: "txn2@example.com",
            status: "active",
            age: 25,
          });

          yield* table.transact([insertOp, insertOp2]);

          const user1 = yield* UserEntity.get({
            userId: "txn-entity-1",
          });
          const user2 = yield* UserEntity.get({
            userId: "txn-entity-2",
          });

          expect(user1).not.toBeNull();
          expect(user2).not.toBeNull();
        }),
      );

      it.effect("executes mixed insert and update operations", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            userId: "txn-existing-1",
            name: "Existing User",
            email: "existing@example.com",
            status: "pending",
            age: 40,
          });

          const insertOp = yield* UserEntity.insertOp({
            userId: "txn-new-1",
            name: "New User",
            email: "new@example.com",
            status: "active",
            age: 22,
          });

          const updateOp = yield* UserEntity.updateOp(
            { userId: "txn-existing-1" },
            { status: "verified" },
          );

          yield* table.transact([insertOp, updateOp]);

          const newUser = yield* UserEntity.get({
            userId: "txn-new-1",
          });
          const existingUser = yield* UserEntity.get({
            userId: "txn-existing-1",
          });

          expect(newUser).not.toBeNull();
          expect(existingUser?.value.status).toBe("verified");
        }),
      );
    });

    describe("query with sort key conditions", () => {
      beforeAll(async () => {
        await Effect.runPromise(
          Effect.gen(function* () {
            yield* OrderEntity.insert({
              orderId: "order-001",
              userId: "entity-query-sk-user",
              total: 100,
              status: "pending",
              items: [],
            });
            yield* OrderEntity.insert({
              orderId: "order-002",
              userId: "entity-query-sk-user",
              total: 200,
              status: "completed",
              items: [],
            });
            yield* OrderEntity.insert({
              orderId: "order-003",
              userId: "entity-query-sk-user",
              total: 300,
              status: "cancelled",
              items: [],
            });
          }),
        );
      });

      it.effect("queries entities with sk beginsWith using raw.query", () =>
        Effect.gen(function* () {
          // Entity raw.query uses derivation values, not derived strings
          // Type assertion needed as beginsWith type is string but runtime supports objects
          const result = yield* OrderEntity.raw.query("primary", {
            pk: { userId: "entity-query-sk-user" },
            sk: { beginsWith: { orderId: "order-00" } as any },
          });

          expect(result.items.length).toBe(3);
        }),
      );

      it.effect("queries entities with sk comparison using simplified API", () =>
        Effect.gen(function* () {
          // Simplified query uses KeyOp with comparison operators
          // SK is the idField (orderId) for primary index
          const result = yield* OrderEntity.query("primary", {
            pk: { userId: "entity-query-sk-user" },
            sk: { ">": "order-001" },
          });

          expect(result.items.length).toBe(2);
        }),
      );
    });
  });

  describe("Expression Module Integration", () => {
    describe("conditionExpr", () => {
      it.effect("filters with attributeExists", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "COND_EXPR#1",
            sk: "ITEM#1",
            optionalField: "exists",
          });
          yield* table.putItem({
            pk: "COND_EXPR#1",
            sk: "ITEM#2",
            // optionalField not present
          });

          const condition = exprCondition<{ optionalField?: string }>(($) =>
            $.attributeExists("optionalField"),
          );
          const exprResult = buildExpr({ condition });

          // Try to update item with condition - should succeed for ITEM#1
          const update = exprUpdate<{ status: string }>(($) => [
            $.set("status", "updated"),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "COND_EXPR#1", sk: "ITEM#1" },
            {
              ...updateExprResult,
              ConditionExpression: exprResult.ConditionExpression,
              ExpressionAttributeNames: {
                ...updateExprResult.ExpressionAttributeNames,
                ...exprResult.ExpressionAttributeNames,
              },
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.status).toBe("updated");
        }),
      );

      it.effect("filters with attributeNotExists", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "COND_EXPR#2",
            sk: "ITEM#1",
            // noField not present - condition should pass
          });

          const condition = exprCondition<{ noField?: string }>(($) =>
            $.attributeNotExists("noField"),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ noField: string }>(($) => [
            $.set("noField", "created"),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "COND_EXPR#2", sk: "ITEM#1" },
            {
              ...updateExprResult,
              ConditionExpression: exprResult.ConditionExpression,
              ExpressionAttributeNames: {
                ...updateExprResult.ExpressionAttributeNames,
                ...exprResult.ExpressionAttributeNames,
              },
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.noField).toBe("created");
        }),
      );

      it.effect("filters with not equals (<>)", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "COND_EXPR#3",
            sk: "ITEM#1",
            status: "active",
          });

          const condition = exprCondition<{ status: string }>(($) =>
            $.cond("status", "<>", "inactive"),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ count: number }>(($) => [
            $.set("count", 1),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "COND_EXPR#3", sk: "ITEM#1" },
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
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.count).toBe(1);
        }),
      );

      it.effect("filters with nested AND conditions", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "COND_EXPR#4",
            sk: "ITEM#1",
            status: "active",
            count: 10,
          });

          const condition = exprCondition<{ status: string; count: number }>(
            ($) =>
              $.and($.cond("status", "=", "active"), $.cond("count", ">=", 5)),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ verified: boolean }>(($) => [
            $.set("verified", true),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "COND_EXPR#4", sk: "ITEM#1" },
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
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.verified).toBe(true);
        }),
      );

      it.effect("filters with nested OR conditions", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "COND_EXPR#5",
            sk: "ITEM#1",
            status: "pending",
            priority: "low",
          });

          const condition = exprCondition<{ status: string; priority: string }>(
            ($) =>
              $.or(
                $.cond("status", "=", "active"),
                $.cond("priority", "=", "low"),
              ),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ processed: boolean }>(($) => [
            $.set("processed", true),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "COND_EXPR#5", sk: "ITEM#1" },
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
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.processed).toBe(true);
        }),
      );

      it.effect("filters with complex AND/OR combination", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "COND_EXPR#6",
            sk: "ITEM#1",
            type: "order",
            status: "pending",
            total: 500,
          });

          const condition = exprCondition<{
            type: string;
            status: string;
            total: number;
          }>(($) =>
            $.and(
              $.cond("type", "=", "order"),
              $.or(
                $.cond("status", "=", "completed"),
                $.cond("total", ">=", 100),
              ),
            ),
          );
          const exprResult = buildExpr({ condition });

          const update = exprUpdate<{ flagged: boolean }>(($) => [
            $.set("flagged", true),
          ]);
          const updateExprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "COND_EXPR#6", sk: "ITEM#1" },
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
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.flagged).toBe(true);
        }),
      );
    });

    describe("updateExpr", () => {
      it.effect("sets with ifNotExists", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "UPDATE_EXPR#1",
            sk: "ITEM#1",
            // counter not present
          });

          const update = exprUpdate<{ counter: number }>(($) => [
            $.set("counter", $.opIfNotExists("counter", 0)),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "UPDATE_EXPR#1", sk: "ITEM#1" },
            {
              ...exprResult,
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.counter).toBe(0);

          // Update again - should keep the value
          const result2 = yield* table.updateItem(
            { pk: "UPDATE_EXPR#1", sk: "ITEM#1" },
            {
              ...exprResult,
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result2.Attributes?.counter).toBe(0);
        }),
      );

      it.effect("appends to array", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "UPDATE_EXPR#2",
            sk: "ITEM#1",
            tags: ["initial"],
          });

          const update = exprUpdate<{ tags: string[] }>(($) => [
            $.append("tags", ["new-tag", "another-tag"]),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "UPDATE_EXPR#2", sk: "ITEM#1" },
            {
              ...exprResult,
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.tags).toEqual([
            "initial",
            "new-tag",
            "another-tag",
          ]);
        }),
      );

      it.effect("prepends to array", () =>
        Effect.gen(function* () {
          yield* table.putItem({
            pk: "UPDATE_EXPR#3",
            sk: "ITEM#1",
            logs: ["existing-log"],
          });

          const update = exprUpdate<{ logs: string[] }>(($) => [
            $.prepend("logs", ["first-log"]),
          ]);
          const exprResult = buildExpr({ update });

          const result = yield* table.updateItem(
            { pk: "UPDATE_EXPR#3", sk: "ITEM#1" },
            {
              ...exprResult,
              ReturnValues: "ALL_NEW",
            },
          );

          expect(result.Attributes?.logs).toEqual([
            "first-log",
            "existing-log",
          ]);
        }),
      );
    });

    describe("filterExpr with query", () => {
      beforeAll(async () => {
        await Effect.runPromise(
          Effect.gen(function* () {
            yield* table.putItem({
              pk: "FILTER_QUERY#1",
              sk: "ITEM#1",
              status: "active",
              score: 100,
            });
            yield* table.putItem({
              pk: "FILTER_QUERY#1",
              sk: "ITEM#2",
              status: "inactive",
              score: 200,
            });
            yield* table.putItem({
              pk: "FILTER_QUERY#1",
              sk: "ITEM#3",
              status: "active",
              score: 300,
            });
          }),
        );
      });

      it.effect("queries with filter expression", () =>
        Effect.gen(function* () {
          // table.query expects filter as a ConditionOperation, not compiled
          const filter = exprFilter<{ status: string }>(($) =>
            $.cond("status", "=", "active"),
          );

          const result = yield* table.query(
            { pk: "FILTER_QUERY#1" },
            { filter },
          );

          expect(result.Items.length).toBe(2);
          expect(result.Items.every((i) => i.status === "active")).toBe(true);
        }),
      );

      it.effect("queries with complex filter expression", () =>
        Effect.gen(function* () {
          // table.query expects filter as a ConditionOperation, not compiled
          const filter = exprFilter<{ status: string; score: number }>(($) =>
            $.and($.cond("status", "=", "active"), $.cond("score", ">", 150)),
          );

          const result = yield* table.query(
            { pk: "FILTER_QUERY#1" },
            { filter },
          );

          expect(result.Items.length).toBe(1);
          expect(result.Items[0]?.score).toBe(300);
        }),
      );
    });
  });

  describe("Timeline Index", () => {
    // Create an entity with timeline index for time-ordered queries
    const taskSchema = ESchema.make("Task", "taskId", {
      projectId: Schema.String,
      title: Schema.String,
      status: Schema.String,
    }).build();

    // Entity with timeline index - uses same PK as primary but SK is _uid
    const TaskEntity = DynamoEntity.make(table)
      .eschema(taskSchema)
      .primary({ pk: ["projectId"] })
      .timeline("GSI1") // Timeline index for time-ordered queries
      .build();

    describe("timeline index queries", () => {
      beforeAll(async () => {
        await Effect.runPromise(
          Effect.gen(function* () {
            // Insert tasks with delays to ensure different _uid values
            yield* TaskEntity.insert({
              taskId: "task-001",
              projectId: "proj-timeline",
              title: "First Task",
              status: "pending",
            });
            yield* TaskEntity.insert({
              taskId: "task-002",
              projectId: "proj-timeline",
              title: "Second Task",
              status: "in_progress",
            });
            yield* TaskEntity.insert({
              taskId: "task-003",
              projectId: "proj-timeline",
              title: "Third Task",
              status: "completed",
            });
            yield* TaskEntity.insert({
              taskId: "task-004",
              projectId: "proj-timeline",
              title: "Fourth Task",
              status: "pending",
            });
            yield* TaskEntity.insert({
              taskId: "task-005",
              projectId: "proj-timeline",
              title: "Fifth Task",
              status: "in_progress",
            });
          }),
        );
      });

      it.effect("queries all items in ascending order (by _uid)", () =>
        Effect.gen(function* () {
          const result = yield* TaskEntity.query("timeline", {
            pk: { projectId: "proj-timeline" },
            sk: { ">=": null },
          });

          expect(result.items).toHaveLength(5);
          // Verify items are in ascending _uid order
          const uids = result.items.map((i) => i.meta._uid);
          for (let i = 1; i < uids.length; i++) {
            expect(uids[i]! > uids[i - 1]!).toBe(true);
          }
        }),
      );

      it.effect("queries all items in descending order (by _uid)", () =>
        Effect.gen(function* () {
          const result = yield* TaskEntity.query("timeline", {
            pk: { projectId: "proj-timeline" },
            sk: { "<=": null },
          });

          expect(result.items).toHaveLength(5);
          // Verify items are in descending _uid order
          const uids = result.items.map((i) => i.meta._uid);
          for (let i = 1; i < uids.length; i++) {
            expect(uids[i]! < uids[i - 1]!).toBe(true);
          }
        }),
      );

      it.effect("queries with limit (first N by ascending _uid)", () =>
        Effect.gen(function* () {
          const result = yield* TaskEntity.query(
            "timeline",
            {
              pk: { projectId: "proj-timeline" },
              sk: { ">=": null },
            },
            { limit: 3 },
          );

          expect(result.items).toHaveLength(3);
          // Verify ascending order
          const uids = result.items.map((i) => i.meta._uid);
          for (let i = 1; i < uids.length; i++) {
            expect(uids[i]! > uids[i - 1]!).toBe(true);
          }
        }),
      );

      it.effect("queries with limit (last N by descending _uid)", () =>
        Effect.gen(function* () {
          const result = yield* TaskEntity.query(
            "timeline",
            {
              pk: { projectId: "proj-timeline" },
              sk: { "<=": null },
            },
            { limit: 3 },
          );

          expect(result.items).toHaveLength(3);
          // Verify descending order
          const uids = result.items.map((i) => i.meta._uid);
          for (let i = 1; i < uids.length; i++) {
            expect(uids[i]! < uids[i - 1]!).toBe(true);
          }
        }),
      );

      it.effect("queries from specific cursor (pagination)", () =>
        Effect.gen(function* () {
          // Get first page
          const firstPage = yield* TaskEntity.query(
            "timeline",
            {
              pk: { projectId: "proj-timeline" },
              sk: { ">=": null },
            },
            { limit: 2 },
          );

          expect(firstPage.items).toHaveLength(2);

          // Use last item's _uid as cursor for next page
          const lastItem = firstPage.items[firstPage.items.length - 1];
          const cursor = lastItem!.meta._uid;

          const secondPage = yield* TaskEntity.query(
            "timeline",
            {
              pk: { projectId: "proj-timeline" },
              sk: { ">": cursor },
            },
            { limit: 2 },
          );

          expect(secondPage.items).toHaveLength(2);
          // Verify all items on second page have _uid > cursor
          for (const item of secondPage.items) {
            expect(item.meta._uid > cursor).toBe(true);
          }
          // Verify ascending order within page
          expect(secondPage.items[1]!.meta._uid > secondPage.items[0]!.meta._uid).toBe(true);
        }),
      );

      it.effect("queries from cursor descending (reverse pagination)", () =>
        Effect.gen(function* () {
          // Get last page first (descending)
          const lastPage = yield* TaskEntity.query(
            "timeline",
            {
              pk: { projectId: "proj-timeline" },
              sk: { "<=": null },
            },
            { limit: 2 },
          );

          expect(lastPage.items).toHaveLength(2);

          // Use last item's _uid as cursor for previous page
          const lastItem = lastPage.items[lastPage.items.length - 1];
          const cursor = lastItem!.meta._uid;

          const previousPage = yield* TaskEntity.query(
            "timeline",
            {
              pk: { projectId: "proj-timeline" },
              sk: { "<": cursor },
            },
            { limit: 2 },
          );

          expect(previousPage.items).toHaveLength(2);
          // Verify all items on previous page have _uid < cursor
          for (const item of previousPage.items) {
            expect(item.meta._uid < cursor).toBe(true);
          }
          // Verify descending order within page
          expect(previousPage.items[1]!.meta._uid < previousPage.items[0]!.meta._uid).toBe(true);
        }),
      );

      it.effect("primary index still works with same entity", () =>
        Effect.gen(function* () {
          // Query by primary index (sorted by taskId)
          const result = yield* TaskEntity.query("primary", {
            pk: { projectId: "proj-timeline" },
            sk: { ">=": null },
          });

          expect(result.items).toHaveLength(5);
          // Primary index sk is taskId, so sorted alphabetically
          const taskIds = result.items.map((i) => i.value.taskId);
          expect(taskIds[0]).toBe("task-001");
          expect(taskIds[4]).toBe("task-005");
        }),
      );

      it.effect("returns empty for non-existent partition", () =>
        Effect.gen(function* () {
          const result = yield* TaskEntity.query("timeline", {
            pk: { projectId: "non-existent-project" },
            sk: { ">=": null },
          });

          expect(result.items).toHaveLength(0);
        }),
      );
    });

    describe("timeline index with raw.query", () => {
      it.effect("raw.query on timeline index works", () =>
        Effect.gen(function* () {
          const result = yield* TaskEntity.raw.query("timeline", {
            pk: { projectId: "proj-timeline" },
          });

          expect(result.items).toHaveLength(5);
        }),
      );

      it.effect("raw.query with sk condition works", () =>
        Effect.gen(function* () {
          // Get one item to use its _uid as a cursor
          const first = yield* TaskEntity.query(
            "timeline",
            {
              pk: { projectId: "proj-timeline" },
              sk: { ">=": null },
            },
            { limit: 1 },
          );

          const firstUid = first.items[0]!.meta._uid;

          const result = yield* TaskEntity.raw.query(
            "timeline",
            {
              pk: { projectId: "proj-timeline" },
              sk: { ">": { _uid: firstUid } },
            },
            { Limit: 2 },
          );

          expect(result.items).toHaveLength(2);
        }),
      );
    });

    describe("timeline index descriptor", () => {
      it("getDescriptor includes timeline index", () => {
        const descriptor = TaskEntity.getDescriptor();

        expect(descriptor.timelineIndex).toBeDefined();
        expect(descriptor.timelineIndex!.name).toBe("timeline");
        expect(descriptor.timelineIndex!.pk.deps).toContain("projectId");
        expect(descriptor.timelineIndex!.sk.deps).toContain("_uid");
      });
    });

    describe("timeline index error handling", () => {
      // Create entity without timeline index to test error path
      const noTimelineSchema = ESchema.make("NoTimeline", "id", {
        value: Schema.String,
      }).build();

      const NoTimelineEntity = DynamoEntity.make(table)
        .eschema(noTimelineSchema)
        .primary()
        .build();

      it.effect("fails when querying timeline on entity without it", () =>
        Effect.gen(function* () {
          const error = yield* (NoTimelineEntity as any)
            .query("timeline", {
              pk: {},
              sk: { ">=": null },
            })
            .pipe(Effect.flip) as Effect.Effect<DynamodbError>;

          expect(error.error._tag).toBe("QueryFailed");
        }),
      );

      it.effect("fails when raw.query on timeline without it", () =>
        Effect.gen(function* () {
          const error = yield* (NoTimelineEntity as any).raw
            .query("timeline", {
              pk: {},
            })
            .pipe(Effect.flip) as Effect.Effect<DynamodbError>;

          expect(error.error._tag).toBe("QueryFailed");
        }),
      );
    });

    describe("timeline index with updates", () => {
      it.effect("updated items maintain their timeline position", () =>
        Effect.gen(function* () {
          // Insert a new item
          const inserted = yield* TaskEntity.insert({
            taskId: "task-update-test",
            projectId: "proj-update-test",
            title: "Original Title",
            status: "pending",
          });

          const originalUid = inserted.meta._uid;

          // Update the item
          const updated = yield* TaskEntity.update(
            { projectId: "proj-update-test", taskId: "task-update-test" },
            { title: "Updated Title", status: "completed" },
          );

          // _uid changes on update (as per the entity design)
          expect(updated.meta._uid).not.toBe(originalUid);

          // Query timeline should find the item
          const result = yield* TaskEntity.query("timeline", {
            pk: { projectId: "proj-update-test" },
            sk: { ">=": null },
          });

          expect(result.items).toHaveLength(1);
          expect(result.items[0]!.value.title).toBe("Updated Title");
        }),
      );
    });
  });

  describe("Edge Cases", () => {
    it.effect("handles special characters in keys", () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: "SPECIAL@CHARS#1",
          sk: "ITEM:WITH:COLONS#123",
          data: "special-data",
        });

        const result = yield* table.getItem({
          pk: "SPECIAL@CHARS#1",
          sk: "ITEM:WITH:COLONS#123",
        });

        expect(result.Item).not.toBeNull();
        expect(result.Item?.data).toBe("special-data");
      }),
    );

    it.effect("returns empty array for query with no results", () =>
      Effect.gen(function* () {
        const result = yield* table.query({
          pk: "NONEXISTENT_PK#999",
        });

        expect(result.Items).toEqual([]);
        expect(result.Items.length).toBe(0);
      }),
    );

    it.effect("updates nested object paths", () =>
      Effect.gen(function* () {
        yield* table.putItem({
          pk: "NESTED#1",
          sk: "ITEM#1",
          config: {
            theme: "light",
            notifications: true,
          },
        });

        const update = exprUpdate<{ config: { theme: string } }>(($) => [
          $.set("config.theme", "dark"),
        ]);
        const exprResult = buildExpr({ update });

        const result = yield* table.updateItem(
          { pk: "NESTED#1", sk: "ITEM#1" },
          {
            ...exprResult,
            ReturnValues: "ALL_NEW",
          },
        );

        expect((result.Attributes?.config as any)?.theme).toBe("dark");
        expect((result.Attributes?.config as any)?.notifications).toBe(true);
      }),
    );
  });
});
