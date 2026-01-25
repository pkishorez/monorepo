import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import {
  DynamoTable,
  DynamoEntity,
  updateExpr,
  compileUpdateExpr,
  buildExpr,
  addOp,
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
  .gsi("byEmail", "byEmailPK", "byEmailSK")
  .gsi("byStatus", "byStatusPK", "byStatusSK")
  .build();

// Schema definitions for entity tests
const userSchema = ESchema.make("User", {
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  status: Schema.String,
  age: Schema.Number,
}).build();

// Entity receives table instance directly
const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({
    pk: {
      deps: ["id"],
      derive: (v) => [`USER#${v.id}`],
    },
    sk: {
      deps: [],
      derive: () => ["PROFILE"],
    },
  })
  .index("byEmail", {
    pk: {
      deps: ["email"],
      derive: (v) => [`EMAIL#${v.email}`],
    },
    sk: {
      deps: ["id"],
      derive: (v) => [v.id],
    },
  })
  .index("byStatus", {
    pk: {
      deps: ["status"],
      derive: (v) => [`STATUS#${v.status}`],
    },
    sk: {
      deps: ["name"],
      derive: (v) => [v.name],
    },
  })
  .build();

// Order schema for more complex tests
const orderSchema = ESchema.make("Order", {
  userId: Schema.String,
  orderId: Schema.String,
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

const OrderEntity = DynamoEntity.make(table)
  .eschema(orderSchema)
  .primary({
    pk: {
      deps: ["userId"],
      derive: (v) => [`USER#${v.userId}`],
    },
    sk: {
      deps: ["orderId"],
      derive: (v) => [`ORDER#${v.orderId}`],
    },
  })
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
      { AttributeName: "byEmailPK", AttributeType: "S" },
      { AttributeName: "byEmailSK", AttributeType: "S" },
      { AttributeName: "byStatusPK", AttributeType: "S" },
      { AttributeName: "byStatusSK", AttributeType: "S" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "byEmail",
        KeySchema: [
          { AttributeName: "byEmailPK", KeyType: "HASH" },
          { AttributeName: "byEmailSK", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
      {
        IndexName: "byStatus",
        KeySchema: [
          { AttributeName: "byStatusPK", KeyType: "HASH" },
          { AttributeName: "byStatusSK", KeyType: "RANGE" },
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

// Helper to clean up all items from the table
async function cleanupTable() {
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { Items } = yield* table.scan();
        for (const item of Items) {
          yield* table.deleteItem({
            pk: item.pk as string,
            sk: item.sk as string,
          });
        }
      }),
    );
  } catch {
    // Ignore cleanup errors
  }
}

describe("@std-toolkit/db-dynamodb Integration Tests", () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await cleanupTable();
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
          const update = updateExpr<{ name: string; count: number }>(($) => [
            $.set("name", "Updated"),
            $.set("count", addOp("count", 5)),
          ]);
          const expr = buildExpr({ update: compileUpdateExpr(update) });

          const result = yield* table.updateItem(
            { pk: "TEST#update", sk: "ITEM#1" },
            {
              ...expr,
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
          const update = updateExpr<{ name: string }>(($) => [
            $.set("name", "New Item"),
          ]);
          const expr = buildExpr({ update: compileUpdateExpr(update) });

          const result = yield* table.updateItem(
            { pk: "TEST#upsert", sk: "ITEM#1" },
            {
              ...expr,
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

          const update = updateExpr<{ count: number }>(($) => [
            $.set("count", addOp("count", 1)),
          ]);
          const expr = buildExpr({
            update: compileUpdateExpr(update),
          });

          const result = yield* table.updateItem(
            { pk: "TEST#condupdate", sk: "ITEM#1" },
            {
              ...expr,
              ConditionExpression: "#cf_status = :cf_active",
              ExpressionAttributeNames: {
                ...expr.ExpressionAttributeNames,
                "#cf_status": "status",
              },
              ExpressionAttributeValues: {
                ...expr.ExpressionAttributeValues,
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

          const update = updateExpr<{ name: string }>(($) => [
            $.set("name", "Changed"),
          ]);
          const expr = buildExpr({ update: compileUpdateExpr(update) });

          const result = yield* table.updateItem(
            { pk: "TEST#allold", sk: "ITEM#1" },
            {
              ...expr,
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
      it.effect("queries items by partition key", () =>
        Effect.gen(function* () {
          // Insert multiple items
          yield* table.putItem({ pk: "QUERY#1", sk: "ITEM#A", data: "a" });
          yield* table.putItem({ pk: "QUERY#1", sk: "ITEM#B", data: "b" });
          yield* table.putItem({ pk: "QUERY#1", sk: "ITEM#C", data: "c" });
          yield* table.putItem({ pk: "QUERY#2", sk: "ITEM#D", data: "d" });

          const result = yield* table.query({ pk: "QUERY#1" });

          expect(result.Items.length).toBe(3);
        }),
      );

      it.effect("queries with sort key equals", () =>
        Effect.gen(function* () {
          const result = yield* table.query({ pk: "QUERY#1", sk: "ITEM#B" });

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
          yield* table.putItem({
            pk: "BETWEEN#1",
            sk: "SCORE#100",
            player: "a",
          });
          yield* table.putItem({
            pk: "BETWEEN#1",
            sk: "SCORE#200",
            player: "b",
          });
          yield* table.putItem({
            pk: "BETWEEN#1",
            sk: "SCORE#300",
            player: "c",
          });
          yield* table.putItem({
            pk: "BETWEEN#1",
            sk: "SCORE#400",
            player: "d",
          });

          const result = yield* table.query({
            pk: "BETWEEN#1",
            sk: { between: ["SCORE#150", "SCORE#350"] },
          });

          expect(result.Items.length).toBe(2);
          expect(result.Items.map((i) => i.player).sort()).toEqual(["b", "c"]);
        }),
      );

      it.effect("queries with less than", () =>
        Effect.gen(function* () {
          yield* table.putItem({ pk: "LESSTHAN#1", sk: "A", data: "a" });
          yield* table.putItem({ pk: "LESSTHAN#1", sk: "B", data: "b" });
          yield* table.putItem({ pk: "LESSTHAN#1", sk: "C", data: "c" });

          const result = yield* table.query({
            pk: "LESSTHAN#1",
            sk: { "<": "C" },
          });

          expect(result.Items.length).toBe(2);
        }),
      );

      it.effect("queries with greater than", () =>
        Effect.gen(function* () {
          const result = yield* table.query({
            pk: "LESSTHAN#1",
            sk: { ">": "A" },
          });

          expect(result.Items.length).toBe(2);
        }),
      );

      it.effect("queries with Limit", () =>
        Effect.gen(function* () {
          yield* table.putItem({ pk: "LIMIT#1", sk: "A", data: "a" });
          yield* table.putItem({ pk: "LIMIT#1", sk: "B", data: "b" });
          yield* table.putItem({ pk: "LIMIT#1", sk: "C", data: "c" });

          const result = yield* table.query(
            { pk: "LIMIT#1" },
            { Limit: 2 },
          );

          expect(result.Items.length).toBe(2);
        }),
      );

      it.effect("queries with ScanIndexForward false (descending)", () =>
        Effect.gen(function* () {
          yield* table.putItem({ pk: "SCANFWD#1", sk: "1", num: 1 });
          yield* table.putItem({ pk: "SCANFWD#1", sk: "2", num: 2 });
          yield* table.putItem({ pk: "SCANFWD#1", sk: "3", num: 3 });

          const result = yield* table.query(
            { pk: "SCANFWD#1" },
            { ScanIndexForward: false },
          );

          expect(result.Items[0]?.num).toBe(3);
          expect(result.Items[2]?.num).toBe(1);
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
            byEmailPK: "EMAIL#alice@example.com",
            byEmailSK: "100",
            name: "Alice",
          });
          yield* table.putItem({
            pk: "USER#101",
            sk: "PROFILE",
            byEmailPK: "EMAIL#bob@example.com",
            byEmailSK: "101",
            name: "Bob",
          });

          const result = yield* table
            .index("byEmail")
            .query({ pk: "EMAIL#alice@example.com" });

          expect(result.Items.length).toBe(1);
          expect(result.Items[0]?.name).toBe("Alice");
        }),
      );

      it.effect("scans GSI", () =>
        Effect.gen(function* () {
          const result = yield* table.index("byEmail").scan();

          // Should have items with GSI pk from previous test
          expect(result.Items.some((i) => i["byEmailPK"])).toBe(true);
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

          const update1 = updateExpr<{ count: number }>(($) => [
            $.set("count", addOp("count", 5)),
          ]);
          const expr1 = buildExpr({ update: compileUpdateExpr(update1) });

          const update2 = updateExpr<{ count: number }>(($) => [
            $.set("count", addOp("count", -5)),
          ]);
          const expr2 = buildExpr({ update: compileUpdateExpr(update2) });

          const op1 = table.opUpdateItem(
            { pk: "TXN_UPDATE#1", sk: "ITEM#A" },
            { UpdateExpression: expr1.UpdateExpression! },
          );

          const op2 = table.opUpdateItem(
            { pk: "TXN_UPDATE#1", sk: "ITEM#B" },
            { UpdateExpression: expr2.UpdateExpression! },
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
            id: "entity-insert-1",
            name: "Test User",
            email: "test@example.com",
            status: "active",
            age: 30,
          });

          expect(result.value.id).toBe("entity-insert-1");
          expect(result.value.name).toBe("Test User");
          expect(result.meta._e).toBe("User");
          expect(result.meta._i).toBe(0);
          expect(result.meta._d).toBe(false);
        }),
      );

      it.effect("fails when inserting duplicate entity", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            id: "entity-dup-1",
            name: "First",
            email: "dup@example.com",
            status: "active",
            age: 25,
          });

          const result = yield* UserEntity.insert({
            id: "entity-dup-1",
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
            id: "entity-get-1",
            name: "Get Test",
            email: "get@example.com",
            status: "active",
            age: 35,
          });

          const result = yield* UserEntity.get({ id: "entity-get-1" });

          expect(result).not.toBeNull();
          expect(result?.value.name).toBe("Get Test");
          expect(result?.meta._e).toBe("User");
        }),
      );

      it.effect("returns null for non-existent entity", () =>
        Effect.gen(function* () {
          const result = yield* UserEntity.get({ id: "nonexistent-entity" });

          expect(result).toBeNull();
        }),
      );
    });

    describe("update", () => {
      it.effect("updates an existing entity", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            id: "entity-update-1",
            name: "Original Name",
            email: "update@example.com",
            status: "active",
            age: 40,
          });

          const result = yield* UserEntity.update(
            { id: "entity-update-1" },
            { name: "Updated Name", age: 41 },
          );

          expect(result.value.name).toBe("Updated Name");
          expect(result.value.age).toBe(41);
          expect(result.meta._i).toBe(1);
        }),
      );

      it.effect("increments _i on each update", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            id: "entity-incr-1",
            name: "Increment Test",
            email: "incr@example.com",
            status: "active",
            age: 25,
          });

          yield* UserEntity.update(
            { id: "entity-incr-1" },
            { name: "Update 1" },
          );

          const result = yield* UserEntity.update(
            { id: "entity-incr-1" },
            { name: "Update 2" },
          );

          expect(result.meta._i).toBe(2);
        }),
      );

      it.effect("supports optimistic locking with _i", () =>
        Effect.gen(function* () {
          const inserted = yield* UserEntity.insert({
            id: "entity-lock-1",
            name: "Lock Test",
            email: "lock@example.com",
            status: "active",
            age: 30,
          });

          // First update succeeds
          yield* UserEntity.update(
            { id: "entity-lock-1" },
            { name: "Update 1" },
            { meta: { _i: inserted.meta._i } },
          );

          // Second update with stale _i should fail
          const result = yield* UserEntity.update(
            { id: "entity-lock-1" },
            { name: "Update 2" },
            { meta: { _i: inserted.meta._i } },
          ).pipe(Effect.either);

          expect(result._tag).toBe("Left");
        }),
      );
    });

    describe("query", () => {
      it.effect("queries entities by primary key", () =>
        Effect.gen(function* () {
          yield* OrderEntity.insert({
            userId: "query-user-1",
            orderId: "order-001",
            total: 100,
            status: "pending",
            items: [],
          });
          yield* OrderEntity.insert({
            userId: "query-user-1",
            orderId: "order-002",
            total: 200,
            status: "completed",
            items: [],
          });

          const result = yield* OrderEntity.query({
            pk: { userId: "query-user-1" },
          });

          expect(result.items.length).toBe(2);
        }),
      );

      it.effect("queries with limit", () =>
        Effect.gen(function* () {
          const result = yield* OrderEntity.query(
            { pk: { userId: "query-user-1" } },
            { Limit: 1 },
          );

          expect(result.items.length).toBe(1);
        }),
      );
    });

    describe("index queries", () => {
      it.effect("queries by GSI", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            id: "gsi-user-1",
            name: "GSI Test User",
            email: "gsi-test@example.com",
            status: "active",
            age: 28,
          });

          const result = yield* UserEntity.index("byEmail").query({
            pk: { email: "gsi-test@example.com" },
          });

          expect(result.items.length).toBe(1);
          expect(result.items[0]?.value.name).toBe("GSI Test User");
        }),
      );

      it.effect("queries by status GSI", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            id: "status-user-1",
            name: "Status User 1",
            email: "status1@example.com",
            status: "verified",
            age: 30,
          });
          yield* UserEntity.insert({
            id: "status-user-2",
            name: "Status User 2",
            email: "status2@example.com",
            status: "verified",
            age: 25,
          });

          const result = yield* UserEntity.index("byStatus").query({
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
            id: "txn-entity-1",
            name: "Txn User 1",
            email: "txn1@example.com",
            status: "active",
            age: 30,
          });

          const insertOp2 = yield* UserEntity.insertOp({
            id: "txn-entity-2",
            name: "Txn User 2",
            email: "txn2@example.com",
            status: "active",
            age: 25,
          });

          yield* table.transact([insertOp, insertOp2]);

          const user1 = yield* UserEntity.get({ id: "txn-entity-1" });
          const user2 = yield* UserEntity.get({ id: "txn-entity-2" });

          expect(user1).not.toBeNull();
          expect(user2).not.toBeNull();
        }),
      );

      it.effect("executes mixed insert and update operations", () =>
        Effect.gen(function* () {
          yield* UserEntity.insert({
            id: "txn-existing-1",
            name: "Existing User",
            email: "existing@example.com",
            status: "pending",
            age: 40,
          });

          const insertOp = yield* UserEntity.insertOp({
            id: "txn-new-1",
            name: "New User",
            email: "new@example.com",
            status: "active",
            age: 22,
          });

          const updateOp = yield* UserEntity.updateOp(
            { id: "txn-existing-1" },
            { status: "verified" },
          );

          yield* table.transact([insertOp, updateOp]);

          const newUser = yield* UserEntity.get({ id: "txn-new-1" });
          const existingUser = yield* UserEntity.get({ id: "txn-existing-1" });

          expect(newUser).not.toBeNull();
          expect(existingUser?.value.status).toBe("verified");
        }),
      );
    });
  });
});
