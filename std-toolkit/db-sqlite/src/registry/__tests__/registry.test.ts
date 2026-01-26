import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { ESchema } from "@std-toolkit/eschema";
import { Effect, Layer, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../../sql/adapters/better-sqlite3.js";
import { SqliteDB } from "../../sql/db.js";
import { SQLiteTable } from "../../table/table.js";
import { DatabaseRegistry } from "../registry.js";

// ─── Test Schemas ────────────────────────────────────────────────────────────

const UserSchema = ESchema.make("User", {
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
}).build();

const UsersTable = SQLiteTable.make(UserSchema)
  .primary(["id"])
  .index("byEmail", ["email"])
  .build();

const OrderSchema = ESchema.make("CustomerOrder", {
  customerId: Schema.String,
  orderId: Schema.String,
  amount: Schema.Number,
  status: Schema.String,
}).build();

const OrdersTable = SQLiteTable.make(OrderSchema)
  .primary(["customerId", "orderId"])
  .index("byStatus", ["status", "_u"])
  .build();

// ─── DatabaseRegistry Creation ───────────────────────────────────────────────

describe("DatabaseRegistry Creation", () => {
  it("creates empty registry", () => {
    const db = DatabaseRegistry.make().build();

    expect(db.tableNames).toEqual([]);
  });

  it("registers single table", () => {
    const db = DatabaseRegistry.make().register(UsersTable).build();

    expect(db.tableNames).toEqual(["User"]);
  });

  it("registers multiple tables", () => {
    const db = DatabaseRegistry.make()
      .register(UsersTable)
      .register(OrdersTable)
      .build();

    expect(db.tableNames).toHaveLength(2);
    expect(db.tableNames).toContain("User");
    expect(db.tableNames).toContain("CustomerOrder");
  });
});

// ─── Type-safe Table Access ──────────────────────────────────────────────────

describe("DatabaseRegistry Table Access", () => {
  const db = DatabaseRegistry.make()
    .register(UsersTable)
    .register(OrdersTable)
    .build();

  it("provides type-safe table access", () => {
    const users = db.table("User");
    const orders = db.table("CustomerOrder");

    expect(users).toBe(UsersTable);
    expect(orders).toBe(OrdersTable);
  });

  it("returns correct table instances", () => {
    expect(db.table("User").tableName).toBe("User");
    expect(db.table("CustomerOrder").tableName).toBe("CustomerOrder");
  });
});

// ─── Setup ───────────────────────────────────────────────────────────────────

describe("DatabaseRegistry Setup", () => {
  let sqliteDb: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  beforeAll(() => {
    sqliteDb = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(sqliteDb);
  });

  afterAll(() => sqliteDb.close());

  it.effect("sets up all registered tables", () =>
    Effect.gen(function* () {
      const db = DatabaseRegistry.make()
        .register(UsersTable)
        .register(OrdersTable)
        .build();

      yield* db.setup();

      const tables = sqliteDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("User");
      expect(tableNames).toContain("CustomerOrder");
    }).pipe(Effect.provide(layer)),
  );
});

// ─── Transactions ────────────────────────────────────────────────────────────

describe("DatabaseRegistry Transactions", () => {
  let sqliteDb: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const TxUserSchema = ESchema.make("TxUser", {
    id: Schema.String,
    name: Schema.String,
  }).build();

  const TxUsersTable = SQLiteTable.make(TxUserSchema).primary(["id"]).build();

  const TxOrderSchema = ESchema.make("TxOrder", {
    id: Schema.String,
    amount: Schema.Number,
  }).build();

  const TxOrdersTable = SQLiteTable.make(TxOrderSchema).primary(["id"]).build();

  const db = DatabaseRegistry.make()
    .register(TxUsersTable)
    .register(TxOrdersTable)
    .build();

  beforeAll(async () => {
    sqliteDb = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(sqliteDb);
    await Effect.runPromise(db.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => sqliteDb.close());

  it.effect("commits transaction on success", () =>
    Effect.gen(function* () {
      yield* db.transaction(
        Effect.gen(function* () {
          yield* db.table("TxUser").insert({ id: "tx-1", name: "Alice" });
          yield* db.table("TxOrder").insert({ id: "order-1", amount: 100 });
        }),
      );

      const user = yield* db.table("TxUser").get({ id: "tx-1" });
      const order = yield* db.table("TxOrder").get({ id: "order-1" });

      expect(user.value.name).toBe("Alice");
      expect(order.value.amount).toBe(100);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("rolls back transaction on error", () =>
    Effect.gen(function* () {
      const result = yield* db
        .transaction(
          Effect.gen(function* () {
            yield* db.table("TxUser").insert({ id: "tx-rollback", name: "Bob" });
            return yield* Effect.fail(new Error("Rollback"));
          }),
        )
        .pipe(Effect.either);

      expect(result._tag).toBe("Left");

      const query = yield* db.table("TxUser").query("pk", { ">=": { id: "tx-rollback" } });
      const found = query.items.filter((i) => i.value.id === "tx-rollback");
      expect(found).toHaveLength(0);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("returns value from transaction", () =>
    Effect.gen(function* () {
      const result = yield* db.transaction(
        Effect.gen(function* () {
          const user = yield* db.table("TxUser").insert({ id: "tx-return", name: "Charlie" });
          return user.value.name;
        }),
      );

      expect(result).toBe("Charlie");
    }).pipe(Effect.provide(layer)),
  );
});

// ─── Schema Aggregation ──────────────────────────────────────────────────────

describe("DatabaseRegistry getSchema", () => {
  it("returns empty tables for empty registry", () => {
    const db = DatabaseRegistry.make().build();

    const schema = db.getSchema();

    expect(schema.descriptors).toEqual([]);
  });

  it("returns all table descriptors", () => {
    const db = DatabaseRegistry.make()
      .register(UsersTable)
      .register(OrdersTable)
      .build();

    const schema = db.getSchema();

    expect(schema.descriptors).toHaveLength(2);

    const userTable = schema.descriptors.find((t) => t.name === "User");
    const orderTable = schema.descriptors.find((t) => t.name === "CustomerOrder");

    expect(userTable).toBeDefined();
    expect(orderTable).toBeDefined();
  });

  it("includes table index information", () => {
    const db = DatabaseRegistry.make().register(UsersTable).build();

    const schema = db.getSchema();
    const userTable = schema.descriptors[0]!;

    expect(userTable.primaryIndex.name).toBe("primary");
    expect(userTable.primaryIndex.sk.deps).toEqual(["id"]);
    expect(userTable.secondaryIndexes).toHaveLength(1);
    expect(userTable.secondaryIndexes[0]!.name).toBe("byEmail");
  });

  it("includes schema descriptor for each table", () => {
    const db = DatabaseRegistry.make().register(OrdersTable).build();

    const schema = db.getSchema();
    const orderTable = schema.descriptors[0]!;

    expect(orderTable.schema).toBeDefined();
    expect(orderTable.schema.type).toBe("object");
    expect(orderTable.schema.properties).toHaveProperty("customerId");
    expect(orderTable.schema.properties).toHaveProperty("amount");
  });
});

// ─── Integration ─────────────────────────────────────────────────────────────

describe("DatabaseRegistry Integration", () => {
  let sqliteDb: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const ProductSchema = ESchema.make("Product", {
    sku: Schema.String,
    name: Schema.String,
    price: Schema.Number,
  }).build();

  const ProductsTable = SQLiteTable.make(ProductSchema)
    .primary(["sku"])
    .index("byPrice", ["price"])
    .build();

  const InventorySchema = ESchema.make("Inventory", {
    sku: Schema.String,
    warehouse: Schema.String,
    quantity: Schema.Number,
  }).build();

  const InventoryTable = SQLiteTable.make(InventorySchema)
    .primary(["sku", "warehouse"])
    .build();

  const db = DatabaseRegistry.make()
    .register(ProductsTable)
    .register(InventoryTable)
    .build();

  beforeAll(async () => {
    sqliteDb = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(sqliteDb);
    await Effect.runPromise(db.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => sqliteDb.close());

  it.effect("supports full workflow with multiple tables", () =>
    Effect.gen(function* () {
      // Insert product
      yield* db.table("Product").insert({ sku: "SKU-001", name: "Widget", price: 19.99 });

      // Insert inventory in transaction
      yield* db.transaction(
        Effect.gen(function* () {
          yield* db.table("Inventory").insert({ sku: "SKU-001", warehouse: "WH-A", quantity: 100 });
          yield* db.table("Inventory").insert({ sku: "SKU-001", warehouse: "WH-B", quantity: 50 });
        }),
      );

      // Query data
      const product = yield* db.table("Product").get({ sku: "SKU-001" });
      const inventoryA = yield* db.table("Inventory").get({ sku: "SKU-001", warehouse: "WH-A" });
      const inventoryB = yield* db.table("Inventory").get({ sku: "SKU-001", warehouse: "WH-B" });

      expect(product.value.name).toBe("Widget");
      expect(inventoryA.value.quantity).toBe(100);
      expect(inventoryB.value.quantity).toBe(50);

      // Verify schema
      const schema = db.getSchema();
      expect(schema.descriptors).toHaveLength(2);
    }).pipe(Effect.provide(layer)),
  );
});
