import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import { DynamoTable, DynamoEntity } from "../index.js";
import { createDynamoDB } from "../services/DynamoClient.js";

// Use timestamp-based name to avoid schema conflicts between test runs
const TEST_TABLE_NAME = `db-dynamodb-simplified-test-${Date.now()}`;
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

// Create table instance
const table = DynamoTable.make(localConfig)
  .primary("pk", "sk")
  .gsi("GSI1", "GSI1PK", "GSI1SK")
  .build();

// Order schema for testing with composite key
// idField is "orderId" - automatically added as a branded string
const orderSchema = ESchema.make("Order", "orderId", {
  userId: Schema.String,
  total: Schema.Number,
  status: Schema.String,
}).build();

// SK is automatically the idField (orderId) for primary index
// SK is automatically _uid for secondary indexes
const OrderEntity = DynamoEntity.make(table)
  .eschema(orderSchema)
  .primary({ pk: ["userId"] })
  .index("GSI1", "byStatus", { pk: ["status"] })
  .build();

// Helper to create the test table
async function createTestTable() {
  const client = createDynamoDB(localConfig);

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
        if (errorName === "ResourceInUseException") {
          return Effect.void;
        }
        return Effect.fail(e);
      }),
    ),
  );

  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function deleteTestTable() {
  try {
    const client = createDynamoDB(localConfig);
    await Effect.runPromise(client.deleteTable({ TableName: TEST_TABLE_NAME }));
  } catch {
    // Ignore cleanup errors
  }
}

describe("Simplified API Tests", () => {
  beforeAll(async () => {
    await createTestTable();

    // Insert test data
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* OrderEntity.insert({
          userId: "user-001",
          orderId: "order-001",
          total: 100,
          status: "pending",
        });
        yield* OrderEntity.insert({
          userId: "user-001",
          orderId: "order-002",
          total: 200,
          status: "completed",
        });
        yield* OrderEntity.insert({
          userId: "user-001",
          orderId: "order-003",
          total: 300,
          status: "pending",
        });
        yield* OrderEntity.insert({
          userId: "user-002",
          orderId: "order-004",
          total: 150,
          status: "pending",
        });
      }),
    );
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  describe("query(key, params, options) - Simplified Query", () => {
    it.effect("queries primary index with >= operator (ascending)", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.query("primary", {
          pk: { userId: "user-001" },
          sk: { ">=": "order-001" },
        });

        expect(result.items.length).toBe(3);
        // Should be in ascending order
        expect(result.items[0]?.value.orderId).toBe("order-001");
      }),
    );

    it.effect("queries primary index with > operator (ascending)", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.query("primary", {
          pk: { userId: "user-001" },
          sk: { ">": "order-001" },
        });

        expect(result.items.length).toBe(2);
        expect(result.items[0]?.value.orderId).toBe("order-002");
      }),
    );

    it.effect("queries primary index with <= operator (descending)", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.query("primary", {
          pk: { userId: "user-001" },
          sk: { "<=": "order-003" },
        });

        expect(result.items.length).toBe(3);
        // Should be in descending order
        expect(result.items[0]?.value.orderId).toBe("order-003");
      }),
    );

    it.effect("queries primary index with < operator (descending)", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.query("primary", {
          pk: { userId: "user-001" },
          sk: { "<": "order-003" },
        });

        expect(result.items.length).toBe(2);
        expect(result.items[0]?.value.orderId).toBe("order-002");
      }),
    );

    it.effect("queries with limit option", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.query(
          "primary",
          {
            pk: { userId: "user-001" },
            sk: { ">=": "order-001" },
          },
          { limit: 2 },
        );

        expect(result.items.length).toBe(2);
      }),
    );

    it.effect("queries all items ascending with sk: { '>=': null }", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.query("primary", {
          pk: { userId: "user-001" },
          sk: { ">=": null },
        });

        expect(result.items.length).toBe(3);
        expect(result.items[0]?.value.orderId).toBe("order-001");
      }),
    );

    it.effect("queries all items descending with sk: { '<=': null }", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.query("primary", {
          pk: { userId: "user-001" },
          sk: { "<=": null },
        });

        expect(result.items.length).toBe(3);
        expect(result.items[0]?.value.orderId).toBe("order-003");
      }),
    );

    it.effect("queries secondary index (SK is _uid)", () =>
      Effect.gen(function* () {
        // Secondary indexes use _uid as SK, not a custom field
        // Query all items with >= null to get all
        const result = yield* OrderEntity.query("byStatus", {
          pk: { status: "pending" },
          sk: { ">=": null },
        });

        // Should find all pending orders (3 total - user-001 has 2, user-002 has 1)
        expect(result.items.length).toBe(3);
      }),
    );
  });

  describe("subscribe(opts) - Subscription Query", () => {
    it.effect("returns items after cursor", () =>
      Effect.gen(function* () {
        // First get all items to find a cursor using raw.query
        const all = yield* OrderEntity.raw.query("primary", {
          pk: { userId: "user-001" },
        });

        expect(all.items.length).toBe(3);

        // Subscribe from after the first item
        const cursor = {
          userId: "user-001",
          orderId: all.items[0]!.value.orderId,
        };

        const result = yield* OrderEntity.subscribe({
          key: "primary",
          value: cursor,
          limit: 10,
        });

        // Should return items after the cursor
        expect(result.items.length).toBe(2);
      }),
    );

    it.effect("returns empty for null cursor", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.subscribe({
          key: "primary",
          value: null,
          limit: 10,
        });

        expect(result.items).toEqual([]);
      }),
    );
  });

  describe("raw.query(key, params, options) - Complex Queries", () => {
    it.effect("queries with pk only", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.raw.query("primary", {
          pk: { userId: "user-001" },
        });

        expect(result.items.length).toBe(3);
      }),
    );

    it.effect("queries with beginsWith", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.raw.query("primary", {
          pk: { userId: "user-001" },
          sk: { beginsWith: { orderId: "order-00" } as any },
        });

        expect(result.items.length).toBe(3);
      }),
    );

    it.effect("queries with between", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.raw.query("primary", {
          pk: { userId: "user-001" },
          sk: {
            between: [
              { orderId: "order-001" },
              { orderId: "order-002" },
            ],
          },
        });

        expect(result.items.length).toBe(2);
      }),
    );

    it.effect("queries secondary index with raw.query", () =>
      Effect.gen(function* () {
        const result = yield* OrderEntity.raw.query("byStatus", {
          pk: { status: "pending" },
        });

        expect(result.items.length).toBe(3);
      }),
    );

    it.effect("queries with ScanIndexForward option", () =>
      Effect.gen(function* () {
        const ascending = yield* OrderEntity.raw.query(
          "primary",
          { pk: { userId: "user-001" } },
          { ScanIndexForward: true },
        );

        const descending = yield* OrderEntity.raw.query(
          "primary",
          { pk: { userId: "user-001" } },
          { ScanIndexForward: false },
        );

        expect(ascending.items[0]?.value.orderId).toBe("order-001");
        expect(descending.items[0]?.value.orderId).toBe("order-003");
      }),
    );
  });
});
