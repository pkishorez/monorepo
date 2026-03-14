import { Database } from "bun:sqlite";
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Effect } from "effect";
import { SqliteDBBun } from "../bun.js";
import { SqliteDB } from "../../db.js";
import * as Sql from "../../helpers/index.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDir = import.meta.dir;

describe("cross-adapter compatibility", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sqlite-compat-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("better-sqlite3 writes, bun reads", () => {
    let db: Database;
    let dbPath: string;

    beforeAll(() => {
      dbPath = join(tmpDir, "bs3-to-bun.db");

      const result = spawnSync(
        "npx",
        ["tsx", join(testDir, "compat-seed-better-sqlite3.ts"), dbPath],
        { stdio: "pipe", encoding: "utf-8", timeout: 30_000 },
      );

      if (result.status !== 0) {
        throw new Error(`Seed script failed: ${result.stderr}`);
      }

      db = new Database(dbPath, { readonly: true });
    });

    afterAll(() => db.close());

    test("bun can open the database file", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='compat_test'")
        .all();
      expect(tables).toHaveLength(1);
    });

    test("bun reads rows written by better-sqlite3", () => {
      const layer = SqliteDBBun(db);
      const rows = Effect.runSync(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.query<{ id: string; name: string; age: number }>(
            "compat_test",
            Sql.whereNone,
            { orderBy: "ASC", orderByColumn: "id" },
          );
        }).pipe(Effect.provide(layer)),
      );

      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ id: "bs3-1", name: "Alice", age: 30 });
      expect(rows[1]).toMatchObject({ id: "bs3-2", name: "Bob", age: 25 });
      expect(rows[2]).toMatchObject({ id: "bs3-3", name: "Charlie", age: 35 });
    });

    test("bun reads single row via get", () => {
      const layer = SqliteDBBun(db);
      const row = Effect.runSync(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.get<{ id: string; name: string; age: number }>(
            "compat_test",
            Sql.where("id", "=", "bs3-2"),
          );
        }).pipe(Effect.provide(layer)),
      );

      expect(row).toMatchObject({ id: "bs3-2", name: "Bob", age: 25 });
    });

    test("bun sees indexes created by better-sqlite3", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_compat_name'")
        .all();
      expect(indexes).toHaveLength(1);
    });

    test("column types are preserved across adapters", () => {
      const row = db.prepare("SELECT typeof(age) as t FROM compat_test LIMIT 1").get() as { t: string };
      expect(row.t).toBe("integer");
    });
  });

  describe("bun writes, better-sqlite3 reads", () => {
    let dbPath: string;

    beforeAll(() => {
      dbPath = join(tmpDir, "bun-to-bs3.db");

      const bunDb = new Database(dbPath);
      const layer = SqliteDBBun(bunDb);

      Effect.runSync(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;

          yield* sqliteDB.createTable(
            "compat_test",
            ["id TEXT", "name TEXT", "age INTEGER", "active TEXT"],
            ["id"],
          );
          yield* sqliteDB.createIndex("compat_test", "idx_compat_name", ["name"]);

          yield* sqliteDB.insert("compat_test", { id: "bun-1", name: "Dave", age: 28, active: "true" });
          yield* sqliteDB.insert("compat_test", { id: "bun-2", name: "Eve", age: 32, active: "false" });
          yield* sqliteDB.insert("compat_test", { id: "bun-3", name: "Frank", age: 40, active: "true" });
        }).pipe(Effect.provide(layer)),
      );

      bunDb.close();
    });

    test("better-sqlite3 reads rows written by bun", () => {
      const result = spawnSync(
        "npx",
        ["tsx", join(testDir, "compat-read-better-sqlite3.ts"), dbPath, "query"],
        { stdio: "pipe", encoding: "utf-8", timeout: 30_000 },
      );

      if (result.status !== 0) {
        throw new Error(`Reader script failed: ${result.stderr}`);
      }

      const rows = JSON.parse(result.stdout.trim()) as { id: string; name: string; age: number }[];
      expect(rows).toHaveLength(3);
      expect(rows.find((r) => r.id === "bun-1")).toMatchObject({ name: "Dave", age: 28 });
      expect(rows.find((r) => r.id === "bun-2")).toMatchObject({ name: "Eve", age: 32 });
      expect(rows.find((r) => r.id === "bun-3")).toMatchObject({ name: "Frank", age: 40 });
    });

    test("better-sqlite3 can get single row from bun-created db", () => {
      const result = spawnSync(
        "npx",
        ["tsx", join(testDir, "compat-read-better-sqlite3.ts"), dbPath, "get", "bun-2"],
        { stdio: "pipe", encoding: "utf-8", timeout: 30_000 },
      );

      if (result.status !== 0) {
        throw new Error(`Reader script failed: ${result.stderr}`);
      }

      const row = JSON.parse(result.stdout.trim()) as { id: string; name: string; age: number };
      expect(row).toMatchObject({ id: "bun-2", name: "Eve", age: 32 });
    });
  });

  describe("round-trip: bun writes, bs3 updates, bun reads", () => {
    let dbPath: string;

    beforeAll(() => {
      dbPath = join(tmpDir, "roundtrip.db");

      const bunDb = new Database(dbPath);
      const layer = SqliteDBBun(bunDb);

      Effect.runSync(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          yield* sqliteDB.createTable(
            "compat_test",
            ["id TEXT", "name TEXT", "age INTEGER"],
            ["id"],
          );
          yield* sqliteDB.insert("compat_test", { id: "rt-1", name: "Original", age: 20 });
        }).pipe(Effect.provide(layer)),
      );
      bunDb.close();

      const updateResult = spawnSync(
        "npx",
        ["tsx", join(testDir, "compat-read-better-sqlite3.ts"), dbPath, "update"],
        { stdio: "pipe", encoding: "utf-8", timeout: 30_000 },
      );

      if (updateResult.status !== 0) {
        throw new Error(`Update script failed: ${updateResult.stderr}`);
      }
    });

    test("bun reads updated data from better-sqlite3", () => {
      const db = new Database(dbPath, { readonly: true });
      const layer = SqliteDBBun(db);

      const rows = Effect.runSync(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.query<{ id: string; name: string; age: number }>(
            "compat_test",
            Sql.whereNone,
            { orderBy: "ASC", orderByColumn: "id" },
          );
        }).pipe(Effect.provide(layer)),
      );

      db.close();

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ id: "rt-1", name: "Updated", age: 99 });
      expect(rows[1]).toMatchObject({ id: "rt-2", name: "NewRow", age: 50 });
    });
  });
});
