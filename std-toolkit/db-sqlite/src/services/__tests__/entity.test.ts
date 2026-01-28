import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { ESchema } from "@std-toolkit/eschema";
import { Effect, Layer, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../../sql/adapters/better-sqlite3.js";
import { SqliteDB, SqliteDBError } from "../../sql/db.js";
import { SQLiteTable } from "../SQLiteTable.js";
import { SQLiteEntity } from "../SQLiteEntity.js";
import { EntityRegistry } from "../../registry/entity-registry.js";

// ─── Test Schemas ────────────────────────────────────────────────────────────

const UserSchema = ESchema.make("User", {
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
}).build();

const PostSchema = ESchema.make("Post", {
  authorId: Schema.String,
  postId: Schema.String,
  title: Schema.String,
  content: Schema.String,
}).build();

// ─── Single Table Design ─────────────────────────────────────────────────────

describe("SQLite Single Table Design", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  // Create shared table with indexes
  const table = SQLiteTable.make({ tableName: "std_data" })
    .primary("pk", "sk")
    .index("IDX1", "IDX1PK", "IDX1SK")
    .index("IDX2", "IDX2PK", "IDX2SK")
    .build();

  // Create entities with derivations
  const userEntity = SQLiteEntity.make(table)
    .eschema(UserSchema)
    .primary({ pk: ["id"], sk: ["id"] })
    .index("IDX1", "byEmail", { pk: ["email"], sk: ["id"] })
    .build();

  const postEntity = SQLiteEntity.make(table)
    .eschema(PostSchema)
    .primary({ pk: ["authorId"], sk: ["postId"] })
    .index("IDX1", "byAuthor", { pk: ["authorId"], sk: ["postId"] })
    .build();

  // Create registry
  const registry = EntityRegistry.make(table)
    .register(userEntity)
    .register(postEntity)
    .build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(registry.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => db.close());

  describe("setup", () => {
    it("creates shared table", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='std_data'",
        )
        .all();
      expect(tables).toHaveLength(1);
    });

    it("creates primary key columns", () => {
      const columns = db.prepare("PRAGMA table_info(std_data)").all() as {
        name: string;
      }[];
      const colNames = columns.map((c) => c.name);
      expect(colNames).toContain("pk");
      expect(colNames).toContain("sk");
    });

    it("creates secondary index columns", () => {
      const columns = db.prepare("PRAGMA table_info(std_data)").all() as {
        name: string;
      }[];
      const colNames = columns.map((c) => c.name);
      expect(colNames).toContain("IDX1PK");
      expect(colNames).toContain("IDX1SK");
      expect(colNames).toContain("IDX2PK");
      expect(colNames).toContain("IDX2SK");
    });

    it("creates secondary indexes", () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_std_data_%'",
        )
        .all();
      expect(indexes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("insert with pk prefix", () => {
    it.effect("inserts user with pk prefix User#", () =>
      Effect.gen(function* () {
        const result = yield* userEntity.insert({
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
        });

        expect(result.value).toEqual({
          _v: "v1",
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
        });
        expect(result.meta._e).toBe("User");
        expect(result.meta._d).toBe(false);

        // Verify the raw pk/sk in database
        const row = db
          .prepare("SELECT pk, sk FROM std_data WHERE pk = ?")
          .get("User#user-1") as { pk: string; sk: string } | undefined;
        expect(row).toBeDefined();
        expect(row!.pk).toBe("User#user-1");
        expect(row!.sk).toBe("user-1");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("inserts post with pk prefix Post#", () =>
      Effect.gen(function* () {
        const result = yield* postEntity.insert({
          authorId: "author-1",
          postId: "post-1",
          title: "First Post",
          content: "Hello World",
        });

        expect(result.value.authorId).toBe("author-1");
        expect(result.meta._e).toBe("Post");

        // Verify the raw pk/sk in database
        const row = db
          .prepare("SELECT pk, sk FROM std_data WHERE pk = ?")
          .get("Post#author-1") as { pk: string; sk: string } | undefined;
        expect(row).toBeDefined();
        expect(row!.pk).toBe("Post#author-1");
        expect(row!.sk).toBe("post-1");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("get by pk+sk", () => {
    it.effect("retrieves user by pk fields", () =>
      Effect.gen(function* () {
        yield* userEntity.insert({
          id: "user-get-1",
          email: "get@example.com",
          name: "Get User",
        });

        const result = yield* userEntity.get({ id: "user-get-1" });
        expect(result).not.toBeNull();
        expect(result!.value.email).toBe("get@example.com");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("retrieves post by composite pk fields", () =>
      Effect.gen(function* () {
        yield* postEntity.insert({
          authorId: "author-get-1",
          postId: "post-get-1",
          title: "Get Test",
          content: "Content",
        });

        const result = yield* postEntity.get({
          authorId: "author-get-1",
          postId: "post-get-1",
        });
        expect(result).not.toBeNull();
        expect(result!.value.title).toBe("Get Test");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("returns null for non-existent entity", () =>
      Effect.gen(function* () {
        const result = yield* userEntity.get({ id: "non-existent" });
        expect(result).toBeNull();
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("update", () => {
    it.effect("updates entity and preserves unchanged fields", () =>
      Effect.gen(function* () {
        yield* userEntity.insert({
          id: "user-update-1",
          email: "update@example.com",
          name: "Before",
        });

        const updated = yield* userEntity.update(
          { id: "user-update-1" },
          { name: "After" },
        );

        expect(updated.value.name).toBe("After");
        expect(updated.value.email).toBe("update@example.com");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("fails for non-existent entity", () =>
      Effect.gen(function* () {
        const error = yield* userEntity
          .update({ id: "non-existent" }, { name: "X" })
          .pipe(Effect.flip);
        expect(error.error._tag).toBe("UpdateFailed");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("delete (soft delete)", () => {
    it.effect("marks entity as deleted", () =>
      Effect.gen(function* () {
        yield* userEntity.insert({
          id: "user-delete-1",
          email: "delete@example.com",
          name: "Delete Me",
        });

        const deleted = yield* userEntity.delete({ id: "user-delete-1" });
        expect(deleted.meta._d).toBe(true);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("query by primary key", () => {
    beforeAll(async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          // Insert multiple posts for the same author
          yield* postEntity.insert({
            authorId: "query-author",
            postId: "post-a",
            title: "Post A",
            content: "A",
          });
          yield* postEntity.insert({
            authorId: "query-author",
            postId: "post-b",
            title: "Post B",
            content: "B",
          });
          yield* postEntity.insert({
            authorId: "query-author",
            postId: "post-c",
            title: "Post C",
            content: "C",
          });
        }).pipe(Effect.provide(layer)),
      );
    });

    it.effect("queries all posts by author (partition query)", () =>
      Effect.gen(function* () {
        const result = yield* postEntity.query("pk", {
          pk: { authorId: "query-author" },
          sk: { ">=": null },
        });

        const postIds = result.items.map((i) => i.value.postId);
        expect(postIds).toContain("post-a");
        expect(postIds).toContain("post-b");
        expect(postIds).toContain("post-c");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("queries posts with sk condition", () =>
      Effect.gen(function* () {
        const result = yield* postEntity.query("pk", {
          pk: { authorId: "query-author" },
          sk: { ">=": { postId: "post-b" } },
        });

        const postIds = result.items.map((i) => i.value.postId);
        expect(postIds).toContain("post-b");
        expect(postIds).toContain("post-c");
        expect(postIds).not.toContain("post-a");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("queries with descending order", () =>
      Effect.gen(function* () {
        const result = yield* postEntity.query("pk", {
          pk: { authorId: "query-author" },
          sk: { "<=": null },
        });

        const postIds = result.items.map((i) => i.value.postId);
        // DESC order: c, b, a
        expect(postIds[0]).toBe("post-c");
        expect(postIds[postIds.length - 1]).toBe("post-a");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("respects limit option", () =>
      Effect.gen(function* () {
        const result = yield* postEntity.query(
          "pk",
          {
            pk: { authorId: "query-author" },
            sk: { ">=": null },
          },
          { limit: 2 },
        );

        expect(result.items).toHaveLength(2);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("query by secondary index", () => {
    beforeAll(async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* userEntity.insert({
            id: "idx-user-1",
            email: "alpha@example.com",
            name: "Alpha",
          });
          yield* userEntity.insert({
            id: "idx-user-2",
            email: "beta@example.com",
            name: "Beta",
          });
        }).pipe(Effect.provide(layer)),
      );
    });

    it.effect("queries user by email index", () =>
      Effect.gen(function* () {
        const result = yield* userEntity.query("byEmail", {
          pk: { email: "alpha@example.com" },
          sk: { ">=": null },
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]!.value.name).toBe("Alpha");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("registry", () => {
    it("provides access to entities by name", () => {
      const user = registry.entity("User");
      expect(user).toBe(userEntity);

      const post = registry.entity("Post");
      expect(post).toBe(postEntity);
    });

    it("lists entity names", () => {
      const names = registry.entityNames;
      expect(names).toContain("User");
      expect(names).toContain("Post");
    });

    it("returns schema with all entity descriptors", () => {
      const schema = registry.getSchema();
      expect(schema.descriptors).toHaveLength(2);

      const userDesc = schema.descriptors.find((d) => d.name === "User");
      expect(userDesc).toBeDefined();
      expect(userDesc!.primaryIndex.pk.pattern).toContain("User");

      const postDesc = schema.descriptors.find((d) => d.name === "Post");
      expect(postDesc).toBeDefined();
    });
  });

  describe("transactions", () => {
    it.effect("commits on success", () =>
      Effect.gen(function* () {
        yield* registry.transaction(
          Effect.gen(function* () {
            yield* userEntity.insert({
              id: "tx-user-1",
              email: "tx1@example.com",
              name: "Tx1",
            });
            yield* postEntity.insert({
              authorId: "tx-author",
              postId: "tx-post-1",
              title: "Tx Post",
              content: "Content",
            });
          }),
        );

        const user = yield* userEntity.get({ id: "tx-user-1" });
        const post = yield* postEntity.get({
          authorId: "tx-author",
          postId: "tx-post-1",
        });

        expect(user).not.toBeNull();
        expect(post).not.toBeNull();
      }).pipe(Effect.provide(layer)),
    );

    it.effect("rolls back on failure", () =>
      Effect.gen(function* () {
        const result = yield* registry
          .transaction(
            Effect.gen(function* () {
              yield* userEntity.insert({
                id: "tx-rollback-user",
                email: "rollback@example.com",
                name: "Rollback",
              });
              return yield* Effect.fail(new Error("Rollback"));
            }),
          )
          .pipe(Effect.either);

        expect(result._tag).toBe("Left");

        const user = yield* userEntity.get({ id: "tx-rollback-user" });
        expect(user).toBeNull();
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("cross-entity in single table", () => {
    it.effect("stores multiple entity types in same table", () =>
      Effect.gen(function* () {
        yield* userEntity.insert({
          id: "cross-user",
          email: "cross@example.com",
          name: "Cross",
        });
        yield* postEntity.insert({
          authorId: "cross-author",
          postId: "cross-post",
          title: "Cross Post",
          content: "Content",
        });

        // Count all rows in table
        const count = db
          .prepare("SELECT COUNT(*) as count FROM std_data")
          .get() as { count: number };
        expect(count.count).toBeGreaterThan(1);

        // Verify both entity types exist
        const entities = db
          .prepare("SELECT DISTINCT _e FROM std_data")
          .all() as { _e: string }[];
        const entityNames = entities.map((e) => e._e);
        expect(entityNames).toContain("User");
        expect(entityNames).toContain("Post");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("getDescriptor", () => {
    it("returns descriptor with pk prefix", () => {
      const descriptor = userEntity.getDescriptor();

      expect(descriptor.name).toBe("User");
      expect(descriptor.primaryIndex.pk.pattern).toContain("User");
      expect(descriptor.primaryIndex.pk.deps).toContain("id");
    });

    it("returns secondary index descriptors", () => {
      const descriptor = userEntity.getDescriptor();

      expect(descriptor.secondaryIndexes).toHaveLength(1);
      const byEmail = descriptor.secondaryIndexes.find(
        (i) => i.name === "byEmail",
      );
      expect(byEmail).toBeDefined();
      expect(byEmail!.pk.deps).toContain("email");
    });

    it("includes schema descriptor", () => {
      const descriptor = postEntity.getDescriptor();

      expect(descriptor.schema).toBeDefined();
      expect(descriptor.schema.properties).toHaveProperty("authorId");
      expect(descriptor.schema.properties).toHaveProperty("postId");
    });
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe("SQLite Entity Edge Cases", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const table = SQLiteTable.make({ tableName: "edge_data" })
    .primary("pk", "sk")
    .build();

  const SimpleSchema = ESchema.make("Simple", {
    id: Schema.String,
    value: Schema.Number,
  }).build();

  const simpleEntity = SQLiteEntity.make(table)
    .eschema(SimpleSchema)
    .primary({ pk: ["id"], sk: ["id"] })
    .build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(table.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => db.close());

  it.effect("handles special characters in keys", () =>
    Effect.gen(function* () {
      yield* simpleEntity.insert({
        id: "key#with#hashes",
        value: 100,
      });

      const result = yield* simpleEntity.get({ id: "key#with#hashes" });
      expect(result).not.toBeNull();
      expect(result!.value.id).toBe("key#with#hashes");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("handles empty string values", () =>
    Effect.gen(function* () {
      yield* simpleEntity.insert({
        id: "",
        value: 0,
      });

      const result = yield* simpleEntity.get({ id: "" });
      expect(result).not.toBeNull();
    }).pipe(Effect.provide(layer)),
  );

  it.effect("dangerouslyRemoveAllRows clears all data", () =>
    Effect.gen(function* () {
      yield* simpleEntity.insert({ id: "clear-1", value: 1 });
      yield* simpleEntity.insert({ id: "clear-2", value: 2 });

      const { rowsDeleted } = yield* simpleEntity.dangerouslyRemoveAllRows(
        "i know what i am doing",
      );
      expect(rowsDeleted).toBeGreaterThan(0);

      const result = yield* simpleEntity.query("pk", {
        pk: { id: "clear-1" },
        sk: { ">=": null },
      });
      expect(result.items).toHaveLength(0);
    }).pipe(Effect.provide(layer)),
  );
});
