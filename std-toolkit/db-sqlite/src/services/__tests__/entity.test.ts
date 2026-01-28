import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@effect/vitest";
import { ESchema } from "@std-toolkit/eschema";
import { Effect, Layer, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../../sql/adapters/better-sqlite3.js";
import { SqliteDB } from "../../sql/db.js";
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

const CommentSchema = ESchema.make("Comment", {
  postId: Schema.String,
  timestamp: Schema.String,
  commentId: Schema.String,
  text: Schema.String,
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

    it.effect("updates secondary index fields correctly", () =>
      Effect.gen(function* () {
        yield* userEntity.insert({
          id: "user-idx-update",
          email: "old@example.com",
          name: "Index User",
        });

        yield* userEntity.update(
          { id: "user-idx-update" },
          { email: "new@example.com" },
        );

        // Should find by new email
        const byNew = yield* userEntity.query("byEmail", {
          pk: { email: "new@example.com" },
          sk: { ">=": null },
        });
        expect(byNew.items).toHaveLength(1);
        expect(byNew.items[0]!.value.id).toBe("user-idx-update");

        // Should not find by old email
        const byOld = yield* userEntity.query("byEmail", {
          pk: { email: "old@example.com" },
          sk: { ">=": null },
        });
        expect(byOld.items).toHaveLength(0);
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

    it.effect("fails for non-existent entity", () =>
      Effect.gen(function* () {
        const error = yield* userEntity
          .delete({ id: "non-existent-delete" })
          .pipe(Effect.flip);
        expect(error.error._tag).toBe("DeleteFailed");
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

// ─── Query Operators Exhaustive Tests ────────────────────────────────────────

describe("Query Operators", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const table = SQLiteTable.make({ tableName: "query_ops" })
    .primary("pk", "sk")
    .index("IDX1", "IDX1PK", "IDX1SK")
    .build();

  const ItemSchema = ESchema.make("Item", {
    category: Schema.String,
    sortKey: Schema.String,
    value: Schema.Number,
  }).build();

  const itemEntity = SQLiteEntity.make(table)
    .eschema(ItemSchema)
    .primary({ pk: ["category"], sk: ["sortKey"] })
    .index("IDX1", "byCategory", { pk: ["category"], sk: ["sortKey"] })
    .build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(table.setup().pipe(Effect.provide(layer)));

    // Insert test data with sequential sort keys
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* itemEntity.insert({ category: "cat-1", sortKey: "a", value: 1 });
        yield* itemEntity.insert({ category: "cat-1", sortKey: "b", value: 2 });
        yield* itemEntity.insert({ category: "cat-1", sortKey: "c", value: 3 });
        yield* itemEntity.insert({ category: "cat-1", sortKey: "d", value: 4 });
        yield* itemEntity.insert({ category: "cat-1", sortKey: "e", value: 5 });
      }).pipe(Effect.provide(layer)),
    );
  });

  afterAll(() => db.close());

  describe(">= operator", () => {
    it.effect(">= null returns all items in ascending order", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { ">=": null },
        });

        expect(result.items).toHaveLength(5);
        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["a", "b", "c", "d", "e"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect(">= specific value returns items from that point ascending", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { ">=": { sortKey: "c" } },
        });

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["c", "d", "e"]);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("> operator", () => {
    it.effect("> null returns all items in ascending order", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { ">": null },
        });

        expect(result.items).toHaveLength(5);
        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["a", "b", "c", "d", "e"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("> specific value returns items after that point (exclusive)", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { ">": { sortKey: "c" } },
        });

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["d", "e"]);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("<= operator", () => {
    it.effect("<= null returns all items in descending order", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { "<=": null },
        });

        expect(result.items).toHaveLength(5);
        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["e", "d", "c", "b", "a"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("<= specific value returns items up to that point descending", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { "<=": { sortKey: "c" } },
        });

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["c", "b", "a"]);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("< operator", () => {
    it.effect("< null returns all items in descending order", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { "<": null },
        });

        expect(result.items).toHaveLength(5);
        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["e", "d", "c", "b", "a"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("< specific value returns items before that point (exclusive)", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { "<": { sortKey: "c" } },
        });

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["b", "a"]);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("limit with operators", () => {
    it.effect(">= null with limit returns first N ascending", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query(
          "pk",
          { pk: { category: "cat-1" }, sk: { ">=": null } },
          { limit: 2 },
        );

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["a", "b"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("<= null with limit returns last N descending", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query(
          "pk",
          { pk: { category: "cat-1" }, sk: { "<=": null } },
          { limit: 2 },
        );

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["e", "d"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("> specific value with limit", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query(
          "pk",
          { pk: { category: "cat-1" }, sk: { ">": { sortKey: "b" } } },
          { limit: 2 },
        );

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["c", "d"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("< specific value with limit", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query(
          "pk",
          { pk: { category: "cat-1" }, sk: { "<": { sortKey: "d" } } },
          { limit: 2 },
        );

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["c", "b"]);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("secondary index operators", () => {
    it.effect("secondary index >= null ascending", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("byCategory", {
          pk: { category: "cat-1" },
          sk: { ">=": null },
        });

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["a", "b", "c", "d", "e"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("secondary index <= null descending", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("byCategory", {
          pk: { category: "cat-1" },
          sk: { "<=": null },
        });

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["e", "d", "c", "b", "a"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("secondary index with specific value", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("byCategory", {
          pk: { category: "cat-1" },
          sk: { ">=": { sortKey: "c" } },
        });

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["c", "d", "e"]);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("secondary index with limit", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query(
          "byCategory",
          { pk: { category: "cat-1" }, sk: { "<=": null } },
          { limit: 3 },
        );

        const keys = result.items.map((i) => i.value.sortKey);
        expect(keys).toEqual(["e", "d", "c"]);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("empty results", () => {
    it.effect("returns empty array for non-existent partition", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "non-existent" },
          sk: { ">=": null },
        });

        expect(result.items).toHaveLength(0);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("> last item returns empty", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { ">": { sortKey: "e" } },
        });

        expect(result.items).toHaveLength(0);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("< first item returns empty", () =>
      Effect.gen(function* () {
        const result = yield* itemEntity.query("pk", {
          pk: { category: "cat-1" },
          sk: { "<": { sortKey: "a" } },
        });

        expect(result.items).toHaveLength(0);
      }).pipe(Effect.provide(layer)),
    );
  });
});

// ─── Composite Sort Key Tests ────────────────────────────────────────────────

describe("Composite Sort Keys", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const table = SQLiteTable.make({ tableName: "composite_sk" })
    .primary("pk", "sk")
    .index("IDX1", "IDX1PK", "IDX1SK")
    .build();

  const commentEntity = SQLiteEntity.make(table)
    .eschema(CommentSchema)
    .primary({ pk: ["postId"], sk: ["timestamp", "commentId"] })
    .index("IDX1", "byPost", { pk: ["postId"], sk: ["timestamp"] })
    .build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(table.setup().pipe(Effect.provide(layer)));

    // Insert comments with composite sort keys
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* commentEntity.insert({
          postId: "post-1",
          timestamp: "2024-01-01T10:00:00Z",
          commentId: "c1",
          text: "First",
        });
        yield* commentEntity.insert({
          postId: "post-1",
          timestamp: "2024-01-01T11:00:00Z",
          commentId: "c2",
          text: "Second",
        });
        yield* commentEntity.insert({
          postId: "post-1",
          timestamp: "2024-01-01T11:00:00Z",
          commentId: "c3",
          text: "Third (same timestamp)",
        });
        yield* commentEntity.insert({
          postId: "post-1",
          timestamp: "2024-01-01T12:00:00Z",
          commentId: "c4",
          text: "Fourth",
        });
      }).pipe(Effect.provide(layer)),
    );
  });

  afterAll(() => db.close());

  it.effect("queries with composite sk ascending", () =>
    Effect.gen(function* () {
      const result = yield* commentEntity.query("pk", {
        pk: { postId: "post-1" },
        sk: { ">=": null },
      });

      expect(result.items).toHaveLength(4);
      const ids = result.items.map((i) => i.value.commentId);
      // Should be sorted by timestamp#commentId
      expect(ids[0]).toBe("c1");
      expect(ids[3]).toBe("c4");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("queries with composite sk descending", () =>
    Effect.gen(function* () {
      const result = yield* commentEntity.query("pk", {
        pk: { postId: "post-1" },
        sk: { "<=": null },
      });

      const ids = result.items.map((i) => i.value.commentId);
      expect(ids[0]).toBe("c4");
      expect(ids[3]).toBe("c1");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("queries with partial composite sk", () =>
    Effect.gen(function* () {
      const result = yield* commentEntity.query("pk", {
        pk: { postId: "post-1" },
        sk: { ">=": { timestamp: "2024-01-01T11:00:00Z", commentId: "" } },
      });

      const ids = result.items.map((i) => i.value.commentId);
      expect(ids).toContain("c2");
      expect(ids).toContain("c3");
      expect(ids).toContain("c4");
      expect(ids).not.toContain("c1");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("gets item by full composite key", () =>
    Effect.gen(function* () {
      const result = yield* commentEntity.get({
        postId: "post-1",
        timestamp: "2024-01-01T11:00:00Z",
        commentId: "c2",
      });

      expect(result).not.toBeNull();
      expect(result!.value.text).toBe("Second");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("secondary index with single sk field", () =>
    Effect.gen(function* () {
      const result = yield* commentEntity.query("byPost", {
        pk: { postId: "post-1" },
        sk: { ">=": { timestamp: "2024-01-01T11:00:00Z" } },
      });

      expect(result.items.length).toBeGreaterThanOrEqual(3);
    }).pipe(Effect.provide(layer)),
  );
});

// ─── Subscribe Tests ─────────────────────────────────────────────────────────

describe("Subscribe", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const table = SQLiteTable.make({ tableName: "subscribe_test" })
    .primary("pk", "sk")
    .index("IDX1", "IDX1PK", "IDX1SK")
    .build();

  const EventSchema = ESchema.make("Event", {
    streamId: Schema.String,
    eventId: Schema.String,
    data: Schema.String,
  }).build();

  const eventEntity = SQLiteEntity.make(table)
    .eschema(EventSchema)
    .primary({ pk: ["streamId"], sk: ["eventId"] })
    .index("IDX1", "byStream", { pk: ["streamId"], sk: ["eventId"] })
    .build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(table.setup().pipe(Effect.provide(layer)));

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* eventEntity.insert({ streamId: "stream-1", eventId: "001", data: "a" });
        yield* eventEntity.insert({ streamId: "stream-1", eventId: "002", data: "b" });
        yield* eventEntity.insert({ streamId: "stream-1", eventId: "003", data: "c" });
        yield* eventEntity.insert({ streamId: "stream-1", eventId: "004", data: "d" });
        yield* eventEntity.insert({ streamId: "stream-1", eventId: "005", data: "e" });
      }).pipe(Effect.provide(layer)),
    );
  });

  afterAll(() => db.close());

  it.effect("subscribe returns items after cursor (primary)", () =>
    Effect.gen(function* () {
      const result = yield* eventEntity.subscribe({
        key: "pk",
        value: { streamId: "stream-1", eventId: "002" },
      });

      const ids = result.items.map((i) => i.value.eventId);
      expect(ids).toEqual(["003", "004", "005"]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("subscribe with limit", () =>
    Effect.gen(function* () {
      const result = yield* eventEntity.subscribe({
        key: "pk",
        value: { streamId: "stream-1", eventId: "002" },
        limit: 2,
      });

      const ids = result.items.map((i) => i.value.eventId);
      expect(ids).toEqual(["003", "004"]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("subscribe with null value returns empty", () =>
    Effect.gen(function* () {
      const result = yield* eventEntity.subscribe({
        key: "pk",
        value: null,
      });

      expect(result.items).toHaveLength(0);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("subscribe on secondary index", () =>
    Effect.gen(function* () {
      const result = yield* eventEntity.subscribe({
        key: "byStream",
        value: { streamId: "stream-1", eventId: "003" },
      });

      const ids = result.items.map((i) => i.value.eventId);
      expect(ids).toEqual(["004", "005"]);
    }).pipe(Effect.provide(layer)),
  );
});

// ─── Transaction Tests ───────────────────────────────────────────────────────

describe("Transactions Advanced", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const table = SQLiteTable.make({ tableName: "tx_test" })
    .primary("pk", "sk")
    .build();

  const CounterSchema = ESchema.make("Counter", {
    id: Schema.String,
    count: Schema.Number,
  }).build();

  const counterEntity = SQLiteEntity.make(table)
    .eschema(CounterSchema)
    .primary({ pk: ["id"], sk: ["id"] })
    .build();

  const registry = EntityRegistry.make(table).register(counterEntity).build();

  beforeEach(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(registry.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => db.close());

  it.effect("transaction commits multiple operations atomically", () =>
    Effect.gen(function* () {
      yield* registry.transaction(
        Effect.gen(function* () {
          yield* counterEntity.insert({ id: "c1", count: 0 });
          yield* counterEntity.insert({ id: "c2", count: 0 });
          yield* counterEntity.insert({ id: "c3", count: 0 });
        }),
      );

      const c1 = yield* counterEntity.get({ id: "c1" });
      const c2 = yield* counterEntity.get({ id: "c2" });
      const c3 = yield* counterEntity.get({ id: "c3" });

      expect(c1).not.toBeNull();
      expect(c2).not.toBeNull();
      expect(c3).not.toBeNull();
    }).pipe(Effect.provide(layer)),
  );

  it.effect("transaction rolls back all operations on failure", () =>
    Effect.gen(function* () {
      const result = yield* registry
        .transaction(
          Effect.gen(function* () {
            yield* counterEntity.insert({ id: "r1", count: 1 });
            yield* counterEntity.insert({ id: "r2", count: 2 });
            yield* Effect.fail(new Error("Intentional failure"));
            yield* counterEntity.insert({ id: "r3", count: 3 });
          }),
        )
        .pipe(Effect.either);

      expect(result._tag).toBe("Left");

      // All should be rolled back
      const r1 = yield* counterEntity.get({ id: "r1" });
      const r2 = yield* counterEntity.get({ id: "r2" });
      const r3 = yield* counterEntity.get({ id: "r3" });

      expect(r1).toBeNull();
      expect(r2).toBeNull();
      expect(r3).toBeNull();
    }).pipe(Effect.provide(layer)),
  );

  it.effect("transaction with update operations", () =>
    Effect.gen(function* () {
      yield* counterEntity.insert({ id: "u1", count: 0 });

      yield* registry.transaction(
        Effect.gen(function* () {
          const current = yield* counterEntity.get({ id: "u1" });
          yield* counterEntity.update({ id: "u1" }, { count: current!.value.count + 1 });
          yield* counterEntity.update({ id: "u1" }, { count: current!.value.count + 2 });
        }),
      );

      const result = yield* counterEntity.get({ id: "u1" });
      expect(result!.value.count).toBe(2);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("transaction with mixed insert/update/delete", () =>
    Effect.gen(function* () {
      yield* counterEntity.insert({ id: "m1", count: 10 });

      yield* registry.transaction(
        Effect.gen(function* () {
          yield* counterEntity.insert({ id: "m2", count: 20 });
          yield* counterEntity.update({ id: "m1" }, { count: 15 });
          yield* counterEntity.delete({ id: "m1" });
        }),
      );

      const m1 = yield* counterEntity.get({ id: "m1" });
      const m2 = yield* counterEntity.get({ id: "m2" });

      expect(m1).not.toBeNull();
      expect(m1!.meta._d).toBe(true); // soft deleted
      expect(m2).not.toBeNull();
      expect(m2!.value.count).toBe(20);
    }).pipe(Effect.provide(layer)),
  );
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

  it.effect("handles unicode in keys and values", () =>
    Effect.gen(function* () {
      yield* simpleEntity.insert({
        id: "ключ-日本語-🎉",
        value: 42,
      });

      const result = yield* simpleEntity.get({ id: "ключ-日本語-🎉" });
      expect(result).not.toBeNull();
      expect(result!.value.id).toBe("ключ-日本語-🎉");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("handles very long keys", () =>
    Effect.gen(function* () {
      const longId = "x".repeat(1000);
      yield* simpleEntity.insert({
        id: longId,
        value: 999,
      });

      const result = yield* simpleEntity.get({ id: longId });
      expect(result).not.toBeNull();
      expect(result!.value.id).toBe(longId);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("handles numeric edge values", () =>
    Effect.gen(function* () {
      yield* simpleEntity.insert({ id: "max-int", value: Number.MAX_SAFE_INTEGER });
      yield* simpleEntity.insert({ id: "min-int", value: Number.MIN_SAFE_INTEGER });
      yield* simpleEntity.insert({ id: "zero", value: 0 });
      yield* simpleEntity.insert({ id: "negative", value: -123.456 });

      const max = yield* simpleEntity.get({ id: "max-int" });
      const min = yield* simpleEntity.get({ id: "min-int" });
      const zero = yield* simpleEntity.get({ id: "zero" });
      const neg = yield* simpleEntity.get({ id: "negative" });

      expect(max!.value.value).toBe(Number.MAX_SAFE_INTEGER);
      expect(min!.value.value).toBe(Number.MIN_SAFE_INTEGER);
      expect(zero!.value.value).toBe(0);
      expect(neg!.value.value).toBe(-123.456);
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

// ─── Multiple Secondary Indexes ──────────────────────────────────────────────

describe("Multiple Secondary Indexes", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;

  const table = SQLiteTable.make({ tableName: "multi_idx" })
    .primary("pk", "sk")
    .index("IDX1", "IDX1PK", "IDX1SK")
    .index("IDX2", "IDX2PK", "IDX2SK")
    .build();

  const ProductSchema = ESchema.make("Product", {
    id: Schema.String,
    category: Schema.String,
    brand: Schema.String,
    price: Schema.Number,
    name: Schema.String,
  }).build();

  const productEntity = SQLiteEntity.make(table)
    .eschema(ProductSchema)
    .primary({ pk: ["id"], sk: ["id"] })
    .index("IDX1", "byCategory", { pk: ["category"], sk: ["id"] })
    .index("IDX2", "byBrand", { pk: ["brand"], sk: ["id"] })
    .build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(table.setup().pipe(Effect.provide(layer)));

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* productEntity.insert({
          id: "p1",
          category: "electronics",
          brand: "apple",
          price: 999,
          name: "iPhone",
        });
        yield* productEntity.insert({
          id: "p2",
          category: "electronics",
          brand: "samsung",
          price: 899,
          name: "Galaxy",
        });
        yield* productEntity.insert({
          id: "p3",
          category: "clothing",
          brand: "nike",
          price: 150,
          name: "Shoes",
        });
        yield* productEntity.insert({
          id: "p4",
          category: "electronics",
          brand: "apple",
          price: 1299,
          name: "MacBook",
        });
      }).pipe(Effect.provide(layer)),
    );
  });

  afterAll(() => db.close());

  it.effect("queries by first secondary index (category)", () =>
    Effect.gen(function* () {
      const result = yield* productEntity.query("byCategory", {
        pk: { category: "electronics" },
        sk: { ">=": null },
      });

      expect(result.items).toHaveLength(3);
      const names = result.items.map((i) => i.value.name);
      expect(names).toContain("iPhone");
      expect(names).toContain("Galaxy");
      expect(names).toContain("MacBook");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("queries by second secondary index (brand)", () =>
    Effect.gen(function* () {
      const result = yield* productEntity.query("byBrand", {
        pk: { brand: "apple" },
        sk: { ">=": null },
      });

      expect(result.items).toHaveLength(2);
      const names = result.items.map((i) => i.value.name);
      expect(names).toContain("iPhone");
      expect(names).toContain("MacBook");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("both indexes return correct results independently", () =>
    Effect.gen(function* () {
      const byCategory = yield* productEntity.query("byCategory", {
        pk: { category: "clothing" },
        sk: { ">=": null },
      });

      const byBrand = yield* productEntity.query("byBrand", {
        pk: { brand: "nike" },
        sk: { ">=": null },
      });

      // Same product, different access patterns
      expect(byCategory.items).toHaveLength(1);
      expect(byBrand.items).toHaveLength(1);
      expect(byCategory.items[0]!.value.id).toBe(byBrand.items[0]!.value.id);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("update reflects in all indexes", () =>
    Effect.gen(function* () {
      yield* productEntity.update({ id: "p1" }, { category: "phones" });

      // Should not find in old category
      const oldCategory = yield* productEntity.query("byCategory", {
        pk: { category: "electronics" },
        sk: { ">=": null },
      });
      const oldIds = oldCategory.items.map((i) => i.value.id);
      expect(oldIds).not.toContain("p1");

      // Should find in new category
      const newCategory = yield* productEntity.query("byCategory", {
        pk: { category: "phones" },
        sk: { ">=": null },
      });
      expect(newCategory.items).toHaveLength(1);
      expect(newCategory.items[0]!.value.id).toBe("p1");

      // Brand index should still work
      const byBrand = yield* productEntity.query("byBrand", {
        pk: { brand: "apple" },
        sk: { ">=": null },
      });
      const brandIds = byBrand.items.map((i) => i.value.id);
      expect(brandIds).toContain("p1");
    }).pipe(Effect.provide(layer)),
  );
});
