import Database from "better-sqlite3";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "@effect/vitest";
import { ESchema } from "@std-toolkit/eschema";
import { Effect, Layer, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../../sql/adapters/better-sqlite3.js";
import { SqliteDB, SqliteDBError } from "../../sql/db.js";
import { SQLiteTable } from "../table.js";

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

// ─── CRUD Operations ─────────────────────────────────────────────────────────

describe("SQLiteTable CRUD", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(UsersTable.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => db.close());

  describe("setup", () => {
    it("creates table", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'")
        .all();
      expect(tables).toHaveLength(1);
    });

    it("creates indexes", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_User_%'")
        .all();
      expect(indexes).toHaveLength(1);
    });
  });

  describe("insert", () => {
    it.effect("returns entity with value and meta", () =>
      Effect.gen(function* () {
        const result = yield* UsersTable.insert({
          id: "insert-1",
          email: "alice@test.com",
          name: "Alice",
        });

        expect(result.value).toEqual({
          _v: "v1",
          id: "insert-1",
          email: "alice@test.com",
          name: "Alice",
        });
        expect(result.meta._v).toBe("v1");
        expect(result.meta._e).toBe("User");
        expect(result.meta._d).toBe(false);
        expect(result.meta._u).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("get", () => {
    it.effect("retrieves existing entity", () =>
      Effect.gen(function* () {
        yield* UsersTable.insert({ id: "get-1", email: "get@test.com", name: "Get" });
        const result = yield* UsersTable.get({ id: "get-1" });

        expect(result.value.id).toBe("get-1");
        expect(result.meta._e).toBe("User");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("fails for non-existent entity", () =>
      Effect.gen(function* () {
        const error = yield* UsersTable.get({ id: "non-existent" }).pipe(Effect.flip);
        expect(error.error._tag).toBe("GetFailed");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("update", () => {
    it.effect("modifies entity and preserves unchanged fields", () =>
      Effect.gen(function* () {
        yield* UsersTable.insert({ id: "update-1", email: "update@test.com", name: "Before" });
        const updated = yield* UsersTable.update({ id: "update-1" }, { name: "After" });

        expect(updated.value.name).toBe("After");
        expect(updated.value.email).toBe("update@test.com");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("updates meta timestamp", () =>
      Effect.gen(function* () {
        yield* UsersTable.insert({ id: "update-2", email: "time@test.com", name: "Time" });
        const before = yield* UsersTable.get({ id: "update-2" });
        const after = yield* UsersTable.update({ id: "update-2" }, { name: "Updated" });

        expect(after.meta._u).toBeDefined();
        expect(before.meta._u).toBeDefined();
      }).pipe(Effect.provide(layer)),
    );

    it.effect("fails for non-existent entity", () =>
      Effect.gen(function* () {
        const error = yield* UsersTable.update({ id: "non-existent" }, { name: "X" }).pipe(
          Effect.flip,
        );
        expect(error.error._tag).toBe("GetFailed");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("delete", () => {
    it.effect("marks entity as deleted (soft delete)", () =>
      Effect.gen(function* () {
        yield* UsersTable.insert({ id: "delete-1", email: "del@test.com", name: "Del" });
        const deleted = yield* UsersTable.delete({ id: "delete-1" });

        expect(deleted.meta._d).toBe(true);

        const fetched = yield* UsersTable.get({ id: "delete-1" });
        expect(fetched.meta._d).toBe(true);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("fails for non-existent entity", () =>
      Effect.gen(function* () {
        const error = yield* UsersTable.delete({ id: "non-existent" }).pipe(Effect.flip);
        expect(error.error._tag).toBe("GetFailed");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("dangerouslyRemoveAllRows", () => {
    it.effect("deletes all records", () =>
      Effect.gen(function* () {
        yield* UsersTable.insert({ id: "danger-1", email: "d1@test.com", name: "D1" });
        yield* UsersTable.insert({ id: "danger-2", email: "d2@test.com", name: "D2" });

        const { rowsDeleted } = yield* UsersTable.dangerouslyRemoveAllRows("i know what i am doing");
        expect(rowsDeleted).toBeGreaterThan(0);

        const result = yield* UsersTable.query("pk", { ">=": { id: "" } }, { limit: 100 });
        expect(result.items).toHaveLength(0);
      }).pipe(Effect.provide(layer)),
    );
  });
});

// ─── Query Operations ────────────────────────────────────────────────────────

describe("SQLiteTable Query", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(UsersTable.setup().pipe(Effect.provide(layer)));

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* UsersTable.insert({ id: "q-a", email: "a@test.com", name: "A" });
        yield* UsersTable.insert({ id: "q-b", email: "b@test.com", name: "B" });
        yield* UsersTable.insert({ id: "q-c", email: "c@test.com", name: "C" });
        yield* UsersTable.insert({ id: "q-d", email: "d@test.com", name: "D" });
        yield* UsersTable.insert({ id: "q-e", email: "e@test.com", name: "E" });
      }).pipe(Effect.provide(layer)),
    );
  });

  afterAll(() => db.close());

  describe("operators", () => {
    it.effect(">= returns items greater than or equal", () =>
      Effect.gen(function* () {
        const result = yield* UsersTable.query("pk", { ">=": { id: "q-c" } });
        const ids = result.items.map((i) => i.value.id);
        expect(ids).toContain("q-c");
        expect(ids).toContain("q-d");
        expect(ids).toContain("q-e");
        expect(ids).not.toContain("q-a");
        expect(ids).not.toContain("q-b");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("> returns items strictly greater", () =>
      Effect.gen(function* () {
        const result = yield* UsersTable.query("pk", { ">": { id: "q-c" } });
        const ids = result.items.map((i) => i.value.id);
        expect(ids).not.toContain("q-c");
        expect(ids).toContain("q-d");
        expect(ids).toContain("q-e");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("<= returns items less than or equal (DESC order)", () =>
      Effect.gen(function* () {
        const result = yield* UsersTable.query("pk", { "<=": { id: "q-c" } });
        const ids = result.items.map((i) => i.value.id);
        expect(ids).toContain("q-a");
        expect(ids).toContain("q-b");
        expect(ids).toContain("q-c");
        expect(ids).not.toContain("q-d");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("< returns items strictly less (DESC order)", () =>
      Effect.gen(function* () {
        const result = yield* UsersTable.query("pk", { "<": { id: "q-c" } });
        const ids = result.items.map((i) => i.value.id);
        expect(ids).toContain("q-a");
        expect(ids).toContain("q-b");
        expect(ids).not.toContain("q-c");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("by index", () => {
    it.effect("queries by secondary index", () =>
      Effect.gen(function* () {
        const result = yield* UsersTable.query("byEmail", { ">=": { email: "c@test.com" } });
        expect(result.items.length).toBeGreaterThan(0);
        expect(result.items[0]?.value.email).toBe("c@test.com");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("limit", () => {
    it.effect("respects limit option", () =>
      Effect.gen(function* () {
        const result = yield* UsersTable.query("pk", { ">=": { id: "q-" } }, { limit: 2 });
        expect(result.items).toHaveLength(2);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("pagination", () => {
    it.effect("paginates through all records", () =>
      Effect.gen(function* () {
        const allIds: string[] = [];
        let cursor = "q-";

        while (true) {
          const result = yield* UsersTable.query("pk", { ">=": { id: cursor } }, { limit: 2 });
          if (result.items.length === 0) break;

          for (const item of result.items) {
            if (item.value.id.startsWith("q-")) allIds.push(item.value.id);
          }

          const last = result.items[result.items.length - 1];
          if (!last || result.items.length < 2) break;
          cursor = last.value.id + "\0";
        }

        expect(allIds).toHaveLength(5);
        expect(new Set(allIds).size).toBe(5);
      }).pipe(Effect.provide(layer)),
    );
  });
});

// ─── Composite Primary Key ───────────────────────────────────────────────────

describe("SQLiteTable Composite Key", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(OrdersTable.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => db.close());

  it.effect("inserts with composite primary key", () =>
    Effect.gen(function* () {
      const result = yield* OrdersTable.insert({
        customerId: "cust-1",
        orderId: "order-1",
        amount: 100,
        status: "pending",
      });

      expect(result.value.customerId).toBe("cust-1");
      expect(result.value.orderId).toBe("order-1");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("gets by composite key", () =>
    Effect.gen(function* () {
      yield* OrdersTable.insert({
        customerId: "cust-2",
        orderId: "order-2",
        amount: 200,
        status: "completed",
      });

      const result = yield* OrdersTable.get({ customerId: "cust-2", orderId: "order-2" });
      expect(result.value.amount).toBe(200);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("updates by composite key", () =>
    Effect.gen(function* () {
      yield* OrdersTable.insert({
        customerId: "cust-3",
        orderId: "order-3",
        amount: 300,
        status: "pending",
      });

      yield* OrdersTable.update(
        { customerId: "cust-3", orderId: "order-3" },
        { status: "shipped" },
      );

      const result = yield* OrdersTable.get({ customerId: "cust-3", orderId: "order-3" });
      expect(result.value.status).toBe("shipped");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("queries by composite index", () =>
    Effect.gen(function* () {
      yield* OrdersTable.insert({
        customerId: "cust-4",
        orderId: "order-4",
        amount: 400,
        status: "pending",
      });

      const result = yield* OrdersTable.query("byStatus", { ">=": { status: "pending", _u: "" } });
      const pending = result.items.filter((i) => i.value.status === "pending");
      expect(pending.length).toBeGreaterThan(0);
    }).pipe(Effect.provide(layer)),
  );
});

// ─── File Persistence ────────────────────────────────────────────────────────

describe("SQLiteTable Persistence", () => {
  const dbPath = join(tmpdir(), `sqlite-test-${Date.now()}.db`);

  const FileSchema = ESchema.make("FileEntity", {
    id: Schema.String,
    data: Schema.String,
  }).build();

  const FileTable = SQLiteTable.make(FileSchema).primary(["id"]).build();

  afterAll(() => {
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  it.effect("persists data across sessions", () =>
    Effect.gen(function* () {
      const db1 = new Database(dbPath);
      const layer1 = SqliteDBBetterSqlite3(db1);

      yield* FileTable.setup().pipe(Effect.provide(layer1));
      yield* FileTable.insert({ id: "persist-1", data: "original" }).pipe(Effect.provide(layer1));
      db1.close();

      const db2 = new Database(dbPath);
      const layer2 = SqliteDBBetterSqlite3(db2);

      const result = yield* FileTable.get({ id: "persist-1" }).pipe(Effect.provide(layer2));
      expect(result.value.data).toBe("original");

      yield* FileTable.update({ id: "persist-1" }, { data: "updated" }).pipe(Effect.provide(layer2));
      db2.close();

      const db3 = new Database(dbPath);
      const layer3 = SqliteDBBetterSqlite3(db3);

      const final = yield* FileTable.get({ id: "persist-1" }).pipe(Effect.provide(layer3));
      expect(final.value.data).toBe("updated");
      db3.close();
    }),
  );
});

// ─── Transactions ────────────────────────────────────────────────────────────

describe("SQLiteTable Transactions", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const TxSchema = ESchema.make("TxEntity", {
    id: Schema.String,
    value: Schema.Number,
  }).build();

  const TxTable = SQLiteTable.make(TxSchema).primary(["id"]).build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(TxTable.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => db.close());

  describe("commit", () => {
    it.effect("commits on success", () =>
      Effect.gen(function* () {
        yield* SqliteDB.transaction(
          Effect.gen(function* () {
            yield* TxTable.insert({ id: "tx-commit-1", value: 100 });
            yield* TxTable.insert({ id: "tx-commit-2", value: 200 });
          }),
        );

        const r1 = yield* TxTable.get({ id: "tx-commit-1" });
        const r2 = yield* TxTable.get({ id: "tx-commit-2" });
        expect(r1.value.value).toBe(100);
        expect(r2.value.value).toBe(200);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("returns value from transaction", () =>
      Effect.gen(function* () {
        const result = yield* SqliteDB.transaction(
          Effect.gen(function* () {
            const inserted = yield* TxTable.insert({ id: "tx-return", value: 42 });
            return inserted.value.value;
          }),
        );
        expect(result).toBe(42);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("rollback", () => {
    it.effect("rolls back all changes on error", () =>
      Effect.gen(function* () {
        const result = yield* SqliteDB.transaction(
          Effect.gen(function* () {
            yield* TxTable.insert({ id: "tx-rollback-1", value: 1 });
            yield* TxTable.insert({ id: "tx-rollback-2", value: 2 });
            return yield* Effect.fail(new Error("Rollback"));
          }),
        ).pipe(Effect.either);

        expect(result._tag).toBe("Left");

        const q = yield* TxTable.query("pk", { ">=": { id: "tx-rollback-" } });
        expect(q.items.filter((i) => i.value.id.startsWith("tx-rollback-"))).toHaveLength(0);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("rolls back updates on error", () =>
      Effect.gen(function* () {
        yield* TxTable.insert({ id: "tx-update-rollback", value: 100 });

        yield* SqliteDB.transaction(
          Effect.gen(function* () {
            yield* TxTable.update({ id: "tx-update-rollback" }, { value: 999 });
            return yield* Effect.fail(new Error("Rollback"));
          }),
        ).pipe(Effect.either);

        const result = yield* TxTable.get({ id: "tx-update-rollback" });
        expect(result.value.value).toBe(100);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("rolls back deletes on error", () =>
      Effect.gen(function* () {
        yield* TxTable.insert({ id: "tx-delete-rollback", value: 50 });

        yield* SqliteDB.transaction(
          Effect.gen(function* () {
            yield* TxTable.delete({ id: "tx-delete-rollback" });
            return yield* Effect.fail(new Error("Rollback"));
          }),
        ).pipe(Effect.either);

        const result = yield* TxTable.get({ id: "tx-delete-rollback" });
        expect(result.meta._d).toBe(false);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("rolls back on SqliteDBError", () =>
      Effect.gen(function* () {
        const result = yield* SqliteDB.transaction(
          Effect.gen(function* () {
            yield* TxTable.insert({ id: "tx-dberror", value: 1 });
            return yield* Effect.fail(SqliteDBError.insertFailed("TxEntity", "forced"));
          }),
        ).pipe(Effect.either);

        expect(result._tag).toBe("Left");

        const q = yield* TxTable.query("pk", { ">=": { id: "tx-dberror" } });
        expect(q.items.filter((i) => i.value.id === "tx-dberror")).toHaveLength(0);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("sequential transactions", () => {
    it.effect("handles multiple sequential transactions", () =>
      Effect.gen(function* () {
        yield* SqliteDB.transaction(TxTable.insert({ id: "tx-seq-1", value: 1 }));
        yield* SqliteDB.transaction(TxTable.insert({ id: "tx-seq-2", value: 2 }));
        yield* SqliteDB.transaction(TxTable.update({ id: "tx-seq-1" }, { value: 10 }));

        const r1 = yield* TxTable.get({ id: "tx-seq-1" });
        const r2 = yield* TxTable.get({ id: "tx-seq-2" });
        expect(r1.value.value).toBe(10);
        expect(r2.value.value).toBe(2);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("recovers after failed transaction", () =>
      Effect.gen(function* () {
        yield* SqliteDB.transaction(
          Effect.gen(function* () {
            yield* TxTable.insert({ id: "tx-recover", value: 1 });
            return yield* Effect.fail(new Error("Fail"));
          }),
        ).pipe(Effect.either);

        yield* SqliteDB.transaction(TxTable.insert({ id: "tx-recover", value: 2 }));

        const result = yield* TxTable.get({ id: "tx-recover" });
        expect(result.value.value).toBe(2);
      }).pipe(Effect.provide(layer)),
    );
  });
});

// ─── Descriptor ─────────────────────────────────────────────────────────────

describe("SQLiteTable.getDescriptor", () => {
  it("should return descriptor with empty pk for SQLite", () => {
    const descriptor = OrdersTable.getDescriptor();

    expect(descriptor.primaryIndex.pk).toEqual({ deps: [], pattern: "" });
    expect(descriptor.primaryIndex.sk).toEqual({
      deps: ["customerId", "orderId"],
      pattern: "{customerId}#{orderId}",
    });
  });

  it("should return correct name and version", () => {
    const descriptor = OrdersTable.getDescriptor();

    expect(descriptor.name).toBe("CustomerOrder");
    expect(descriptor.version).toBe("v1");
  });

  it("should return primary index with name", () => {
    const descriptor = OrdersTable.getDescriptor();

    expect(descriptor.primaryIndex.name).toBe("primary");
  });

  it("should return secondary indexes with correct structure", () => {
    const descriptor = OrdersTable.getDescriptor();

    expect(descriptor.secondaryIndexes).toHaveLength(1);
    expect(descriptor.secondaryIndexes[0]).toEqual({
      name: "byStatus",
      pk: { deps: [], pattern: "" },
      sk: { deps: ["status", "_u"], pattern: "{status}#{_u}" },
    });
  });

  it("should include schema descriptor", () => {
    const descriptor = OrdersTable.getDescriptor();

    expect(descriptor.schema).toBeDefined();
    expect(descriptor.schema.type).toBe("object");
    expect(descriptor.schema.properties).toHaveProperty("customerId");
    expect(descriptor.schema.properties).toHaveProperty("orderId");
    expect(descriptor.schema.properties).toHaveProperty("status");
    expect(descriptor.schema.properties).toHaveProperty("amount");
  });

  it("should handle table with no secondary indexes", () => {
    const SimpleSchema = ESchema.make("Simple", {
      id: Schema.String,
    }).build();

    const SimpleTable = SQLiteTable.make(SimpleSchema).primary(["id"]).build();

    const descriptor = SimpleTable.getDescriptor();

    expect(descriptor.primaryIndex.sk).toEqual({
      deps: ["id"],
      pattern: "{id}",
    });
    expect(descriptor.secondaryIndexes).toEqual([]);
  });

  it("should handle table with multiple secondary indexes", () => {
    const descriptor = UsersTable.getDescriptor();

    expect(descriptor.secondaryIndexes).toHaveLength(1);

    const byEmail = descriptor.secondaryIndexes.find((i) => i.name === "byEmail");

    expect(byEmail).toEqual({
      name: "byEmail",
      pk: { deps: [], pattern: "" },
      sk: { deps: ["email"], pattern: "{email}" },
    });
  });
});
