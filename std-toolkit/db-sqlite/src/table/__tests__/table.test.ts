import Database from "better-sqlite3";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { ESchema } from "@std-toolkit/eschema";
import { Effect, Layer, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../../sql/adapters/better-sqlite3.js";
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
