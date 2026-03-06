import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { SingleEntityESchema, EntityESchema } from "@std-toolkit/eschema";
import { Effect, type Layer, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../../sql/adapters/better-sqlite3.js";
import type { SqliteDB } from "../../sql/db.js";
import { SQLiteTable } from "../sqlite-table.js";
import { SQLiteEntity } from "../sqlite-entity.js";
import { SQLiteSingleEntity } from "../sqlite-single-entity.js";
import { EntityRegistry } from "../entity-registry.js";

// ─── Test Schemas ────────────────────────────────────────────────────────────

const configSchema = SingleEntityESchema.make("AppConfig", {
  theme: Schema.String,
  maxRetries: Schema.Number,
}).build();

// ─── Setup ──────────────────────────────────────────────────────────────────

describe("SQLiteSingleEntity", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const table = SQLiteTable.make({ tableName: "std_data" })
    .primary("pk", "sk")
    .build();

  const AppConfig = SQLiteSingleEntity.make(table)
    .eschema(configSchema)
    .default({ theme: "light", maxRetries: 3 });

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(table.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => {
    db.close();
  });

  // ─── get ─────────────────────────────────────────────────────────────────

  describe("get", () => {
    it.effect("returns default when absent", () =>
      Effect.gen(function* () {
        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe("light");
        expect(result.value.maxRetries).toBe(3);
        expect(result.meta._u).toBe("");
        expect(result.meta._e).toBe("AppConfig");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("returns stored item after put", () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: "dark", maxRetries: 5 });

        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe("dark");
        expect(result.value.maxRetries).toBe(5);
        expect(result.meta._u).not.toBe("");
        expect(result.meta._e).toBe("AppConfig");
      }).pipe(Effect.provide(layer)),
    );
  });

  // ─── put ─────────────────────────────────────────────────────────────────

  describe("put", () => {
    it.effect("writes unconditionally", () =>
      Effect.gen(function* () {
        const result = yield* AppConfig.put({ theme: "blue", maxRetries: 10 });

        expect(result.value.theme).toBe("blue");
        expect(result.value.maxRetries).toBe(10);
        expect(result.meta._u).not.toBe("");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("overwrites existing", () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: "red", maxRetries: 1 });
        yield* AppConfig.put({ theme: "green", maxRetries: 99 });

        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe("green");
        expect(result.value.maxRetries).toBe(99);
      }).pipe(Effect.provide(layer)),
    );
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe("update", () => {
    it.effect("plain object patch", () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: "light", maxRetries: 3 });

        const result = yield* AppConfig.update({ update: { theme: "dark" } });

        expect(result.value.theme).toBe("dark");
        expect(result.value.maxRetries).toBe(3);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("fails on non-existent item", () =>
      Effect.gen(function* () {
        const emptySchema = SingleEntityESchema.make("EmptyConfig", {
          value: Schema.String,
        }).build();

        const emptyTable = SQLiteTable.make({ tableName: "std_empty" })
          .primary("pk", "sk")
          .build();

        yield* emptyTable.setup();

        const EmptyConfig = SQLiteSingleEntity.make(emptyTable)
          .eschema(emptySchema)
          .default({ value: "x" });

        const error = yield* EmptyConfig.update({
          update: { value: "y" },
        }).pipe(Effect.flip);

        expect(error.error._tag).toBe("UpdateFailed");
      }).pipe(Effect.provide(layer)),
    );
  });

  // ─── registry ────────────────────────────────────────────────────────────

  describe("registry", () => {
    it.effect("registerSingle works", () =>
      Effect.gen(function* () {
        const UserSchema = EntityESchema.make("User", "userId", {
          name: Schema.String,
        }).build();

        const userEntity = SQLiteEntity.make(table)
          .eschema(UserSchema)
          .primary()
          .build();

        const registry = EntityRegistry.make(table)
          .register(userEntity)
          .registerSingle(AppConfig)
          .build();

        // singleEntity accessor works
        const config = registry.singleEntity("AppConfig");
        expect(config.name).toBe("AppConfig");

        // entityNames includes both
        const names = registry.entityNames;
        expect(names).toContain("User");
        expect(names).toContain("AppConfig");

        // getSchema excludes single entities
        const schema = registry.getSchema();
        const descriptorNames = schema.descriptors.map((d) => d.name);
        expect(descriptorNames).toContain("User");
        expect(descriptorNames).not.toContain("AppConfig");
      }).pipe(Effect.provide(layer)),
    );
  });
});
