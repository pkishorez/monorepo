import Database from "better-sqlite3";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { ESchema } from "@std-toolkit/eschema";
import { Effect, Layer, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../../sql/adapters/better-sqlite3.js";
import { SqliteDB, SqliteDBError } from "../../sql/db.js";
import { SQLiteTable } from "../table.js";

const UserSchema = ESchema.make("User", {
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
}).build();

const UsersTable = SQLiteTable.make(UserSchema)
  .primary(["id"])
  .index("byEmail", ["email"])
  .build();

describe("SQLiteTable", () => {
  let db: Database.Database;
  let layer: Layer.Layer<import("../../sql/db.js").SqliteDB>;

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(UsersTable.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => {
    db.close();
  });

  it("setup creates table and indexes", () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='User'",
      )
      .all();
    expect(tables).toHaveLength(1);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_User_%'",
      )
      .all();
    expect(indexes).toHaveLength(1);
  });

  it.effect("insert stores and returns entity with meta", () =>
    Effect.gen(function* () {
      const result = yield* UsersTable.insert({
        id: "user-1",
        email: "alice@example.com",
        name: "Alice",
      });

      expect(result.data).toEqual({
        id: "user-1",
        email: "alice@example.com",
        name: "Alice",
      });
      expect(result.meta._v).toBe("v1");
      expect(result.meta._d).toBe(false);
      expect(result.meta._c).toBeDefined();
      expect(result.meta._u).toBeDefined();
    }).pipe(Effect.provide(layer)),
  );

  it.effect("update modifies entity and updates meta", () =>
    Effect.gen(function* () {
      const original = yield* UsersTable.insert({
        id: "user-2",
        email: "bob@example.com",
        name: "Bob",
      });

      const updated = yield* UsersTable.update(
        { id: "user-2" },
        { name: "Robert" },
      );

      expect(updated.data.name).toBe("Robert");
      expect(updated.data.email).toBe("bob@example.com");
      expect(updated.meta._c).toBe(original.meta._c);
      expect(updated.meta._u).toBeDefined();
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delete marks entity as deleted", () =>
    Effect.gen(function* () {
      yield* UsersTable.insert({
        id: "user-3",
        email: "charlie@example.com",
        name: "Charlie",
      });

      const deleted = yield* UsersTable.delete({ id: "user-3" });

      expect(deleted.meta._d).toBe(true);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("query by primary key returns matching items", () =>
    Effect.gen(function* () {
      yield* UsersTable.insert({
        id: "query-1",
        email: "d@example.com",
        name: "D",
      });
      yield* UsersTable.insert({
        id: "query-2",
        email: "e@example.com",
        name: "E",
      });

      const result = yield* UsersTable.query(
        "pk",
        { ">=": { id: "query-1" } },
        { limit: 10 },
      );

      const ids = result.items.map((i) => i.data.id);
      expect(ids).toContain("query-1");
      expect(ids).toContain("query-2");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("query by index returns matching items", () =>
    Effect.gen(function* () {
      yield* UsersTable.insert({
        id: "idx-1",
        email: "test@example.com",
        name: "Test",
      });

      const result = yield* UsersTable.query("byEmail", {
        ">=": { email: "test@example.com" },
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]?.data.email).toBe("test@example.com");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("get single item via query", () =>
    Effect.gen(function* () {
      yield* UsersTable.insert({
        id: "get-test-1",
        email: "get@example.com",
        name: "GetTest",
      });

      const result = yield* UsersTable.query(
        "pk",
        { ">=": { id: "get-test-1" } },
        { limit: 1 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.data.id).toBe("get-test-1");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("pagination retrieves all 1000 records with limit 10", () =>
    Effect.gen(function* () {
      const totalRecords = 1000;
      const pageSize = 10;

      for (let i = 0; i < totalRecords; i++) {
        const paddedId = `page-${String(i).padStart(5, "0")}`;
        yield* UsersTable.insert({
          id: paddedId,
          email: `page${i}@example.com`,
          name: `Page User ${i}`,
        });
      }

      const allItems: string[] = [];
      let lastId = "page-";

      while (true) {
        const result = yield* UsersTable.query(
          "pk",
          { ">=": { id: lastId } },
          { limit: pageSize },
        );

        if (result.items.length === 0) break;

        for (const item of result.items) {
          if (item.data.id.startsWith("page-")) {
            allItems.push(item.data.id);
          }
        }

        const lastItem = result.items[result.items.length - 1];
        if (!lastItem || result.items.length < pageSize) break;

        lastId = lastItem.data.id + "\0";
      }

      expect(allItems).toHaveLength(totalRecords);

      const uniqueItems = new Set(allItems);
      expect(uniqueItems.size).toBe(totalRecords);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("dangerouslyRemoveAllRows deletes all records", () =>
    Effect.gen(function* () {
      for (let i = 0; i < 5; i++) {
        yield* UsersTable.insert({
          id: `remove-${i}`,
          email: `remove${i}@example.com`,
          name: `Remove ${i}`,
        });
      }

      const beforeResult = yield* UsersTable.query(
        "pk",
        { ">=": { id: "remove-" } },
        { limit: 10 },
      );
      const beforeCount = beforeResult.items.filter((i) =>
        i.data.id.startsWith("remove-"),
      ).length;
      expect(beforeCount).toBe(5);

      const { rowsDeleted } = yield* UsersTable.dangerouslyRemoveAllRows(
        "i know what i am doing",
      );
      expect(rowsDeleted).toBeGreaterThan(0);

      const afterResult = yield* UsersTable.query(
        "pk",
        { ">=": { id: "" } },
        { limit: 10 },
      );
      expect(afterResult.items).toHaveLength(0);
    }).pipe(Effect.provide(layer)),
  );
});

describe("SQLiteTable (file-based)", () => {
  const dbPath = join(tmpdir(), `sqlite-test-${Date.now()}.db`);

  const FileUserSchema = ESchema.make("FileUser", {
    id: Schema.String,
    name: Schema.String,
    score: Schema.Number,
  }).build();

  const FileUsersTable = SQLiteTable.make(FileUserSchema)
    .primary(["id"])
    .build();

  afterAll(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it.effect("writes data to file and reads it back", () =>
    Effect.gen(function* () {
      const db = new Database(dbPath);
      const layer = SqliteDBBetterSqlite3(db);

      yield* FileUsersTable.setup().pipe(Effect.provide(layer));

      yield* FileUsersTable.insert({
        id: "file-user-1",
        name: "Alice",
        score: 100,
      }).pipe(Effect.provide(layer));

      yield* FileUsersTable.insert({
        id: "file-user-2",
        name: "Bob",
        score: 85,
      }).pipe(Effect.provide(layer));

      db.close();

      expect(existsSync(dbPath)).toBe(true);

      const db2 = new Database(dbPath);
      const layer2 = SqliteDBBetterSqlite3(db2);

      const result = yield* FileUsersTable.query(
        "pk",
        { ">=": { id: "file-user-" } },
        { limit: 10 },
      ).pipe(Effect.provide(layer2));

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.data.name).toBe("Alice");
      expect(result.items[0]?.data.score).toBe(100);
      expect(result.items[1]?.data.name).toBe("Bob");
      expect(result.items[1]?.data.score).toBe(85);

      db2.close();
    }),
  );

  it.effect("persists updates across sessions", () =>
    Effect.gen(function* () {
      const db = new Database(dbPath);
      const layer = SqliteDBBetterSqlite3(db);

      yield* FileUsersTable.update({ id: "file-user-1" }, { score: 150 }).pipe(
        Effect.provide(layer),
      );

      db.close();

      const db2 = new Database(dbPath);
      const layer2 = SqliteDBBetterSqlite3(db2);

      const result = yield* FileUsersTable.query(
        "pk",
        { ">=": { id: "file-user-1" } },
        { limit: 1 },
      ).pipe(Effect.provide(layer2));

      expect(result.items[0]?.data.score).toBe(150);

      db2.close();
    }),
  );
});

describe("SQLiteTable transactions", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const TransactionUserSchema = ESchema.make("TxUser", {
    id: Schema.String,
    email: Schema.String,
    balance: Schema.Number,
  }).build();

  const TxUsersTable = SQLiteTable.make(TransactionUserSchema)
    .primary(["id"])
    .build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(TxUsersTable.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => {
    db.close();
  });

  it.effect("commits multiple inserts on success", () =>
    Effect.gen(function* () {
      yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.insert({
            id: "tx-success-1",
            email: "tx1@example.com",
            balance: 100,
          });
          yield* TxUsersTable.insert({
            id: "tx-success-2",
            email: "tx2@example.com",
            balance: 200,
          });
        }),
      );

      const result = yield* TxUsersTable.query(
        "pk",
        { ">=": { id: "tx-success-" } },
        { limit: 10 },
      );

      const txItems = result.items.filter((i) =>
        i.data.id.startsWith("tx-success-"),
      );
      expect(txItems).toHaveLength(2);
      expect(txItems[0]?.data.balance).toBe(100);
      expect(txItems[1]?.data.balance).toBe(200);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("rolls back all changes on error", () =>
    Effect.gen(function* () {
      const result = yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.insert({
            id: "tx-rollback-1",
            email: "rollback1@example.com",
            balance: 500,
          });

          yield* TxUsersTable.insert({
            id: "tx-rollback-2",
            email: "rollback2@example.com",
            balance: 600,
          });

          return yield* Effect.fail(new Error("Simulated failure"));
        }),
      ).pipe(Effect.either);

      expect(result._tag).toBe("Left");

      const query = yield* TxUsersTable.query(
        "pk",
        { ">=": { id: "tx-rollback-" } },
        { limit: 10 },
      );

      const rollbackItems = query.items.filter((i) =>
        i.data.id.startsWith("tx-rollback-"),
      );
      expect(rollbackItems).toHaveLength(0);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("rolls back on SqliteDBError", () =>
    Effect.gen(function* () {
      const result = yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.insert({
            id: "tx-dberror-1",
            email: "dberror1@example.com",
            balance: 100,
          });

          return yield* Effect.fail(
            SqliteDBError.insertFailed("TxUser", new Error("DB error")),
          );
        }),
      ).pipe(Effect.either);

      expect(result._tag).toBe("Left");

      const query = yield* TxUsersTable.query(
        "pk",
        { ">=": { id: "tx-dberror-" } },
        { limit: 10 },
      );

      const items = query.items.filter((i) =>
        i.data.id.startsWith("tx-dberror-"),
      );
      expect(items).toHaveLength(0);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("commits insert and update in same transaction", () =>
    Effect.gen(function* () {
      yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.insert({
            id: "tx-update-1",
            email: "update@example.com",
            balance: 1000,
          });

          yield* TxUsersTable.update({ id: "tx-update-1" }, { balance: 1500 });
        }),
      );

      const result = yield* TxUsersTable.get({ id: "tx-update-1" });
      expect(result.data.balance).toBe(1500);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("rolls back partial updates on error", () =>
    Effect.gen(function* () {
      yield* TxUsersTable.insert({
        id: "tx-partial-1",
        email: "partial@example.com",
        balance: 100,
      });

      const result = yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.update({ id: "tx-partial-1" }, { balance: 999 });

          return yield* Effect.fail(new Error("Failure after update"));
        }),
      ).pipe(Effect.either);

      expect(result._tag).toBe("Left");

      const item = yield* TxUsersTable.get({ id: "tx-partial-1" });
      expect(item.data.balance).toBe(100);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("commits delete in transaction", () =>
    Effect.gen(function* () {
      yield* TxUsersTable.insert({
        id: "tx-delete-1",
        email: "delete@example.com",
        balance: 50,
      });

      yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.delete({ id: "tx-delete-1" });
        }),
      );

      const item = yield* TxUsersTable.get({ id: "tx-delete-1" });
      expect(item.meta._d).toBe(true);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("rolls back delete on error", () =>
    Effect.gen(function* () {
      yield* TxUsersTable.insert({
        id: "tx-delete-rollback-1",
        email: "deleterollback@example.com",
        balance: 75,
      });

      const result = yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.delete({ id: "tx-delete-rollback-1" });
          return yield* Effect.fail(new Error("Failure after delete"));
        }),
      ).pipe(Effect.either);

      expect(result._tag).toBe("Left");

      const item = yield* TxUsersTable.get({ id: "tx-delete-rollback-1" });
      expect(item.meta._d).toBe(false);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("transaction returns value on success", () =>
    Effect.gen(function* () {
      const result = yield* SqliteDB.transaction(
        Effect.gen(function* () {
          const inserted = yield* TxUsersTable.insert({
            id: "tx-return-1",
            email: "return@example.com",
            balance: 250,
          });
          return inserted;
        }),
      );

      expect(result.data.id).toBe("tx-return-1");
      expect(result.data.balance).toBe(250);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("multiple sequential transactions work correctly", () =>
    Effect.gen(function* () {
      yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.insert({
            id: "tx-seq-1",
            email: "seq1@example.com",
            balance: 100,
          });
        }),
      );

      yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.insert({
            id: "tx-seq-2",
            email: "seq2@example.com",
            balance: 200,
          });
        }),
      );

      yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.update({ id: "tx-seq-1" }, { balance: 150 });
        }),
      );

      const item1 = yield* TxUsersTable.get({ id: "tx-seq-1" });
      const item2 = yield* TxUsersTable.get({ id: "tx-seq-2" });

      expect(item1.data.balance).toBe(150);
      expect(item2.data.balance).toBe(200);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("failed transaction followed by successful transaction", () =>
    Effect.gen(function* () {
      const failedResult = yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.insert({
            id: "tx-recover-1",
            email: "recover@example.com",
            balance: 500,
          });
          return yield* Effect.fail(new Error("First transaction fails"));
        }),
      ).pipe(Effect.either);

      expect(failedResult._tag).toBe("Left");

      yield* SqliteDB.transaction(
        Effect.gen(function* () {
          yield* TxUsersTable.insert({
            id: "tx-recover-1",
            email: "recover@example.com",
            balance: 600,
          });
        }),
      );

      const item = yield* TxUsersTable.get({ id: "tx-recover-1" });
      expect(item.data.balance).toBe(600);
    }).pipe(Effect.provide(layer)),
  );
});
