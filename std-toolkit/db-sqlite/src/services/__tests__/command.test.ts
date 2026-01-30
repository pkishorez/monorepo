import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { ESchema } from "@std-toolkit/eschema";
import { Effect, Layer, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../../sql/adapters/better-sqlite3.js";
import { SqliteDB } from "../../sql/db.js";
import { SQLiteTable } from "../sqlite-table.js";
import { SQLiteEntity } from "../sqlite-entity.js";
import { EntityRegistry } from "../entity-registry.js";
import { SqliteCommand } from "../sqlite-command.js";
import { CommandError } from "@std-toolkit/core/command";

// ─── Test Schemas ────────────────────────────────────────────────────────────

const UserSchema = ESchema.make("User", "userId", {
  email: Schema.String,
  name: Schema.String,
}).build();

const PostSchema = ESchema.make("Post", "postId", {
  authorId: Schema.String,
  title: Schema.String,
  content: Schema.String,
}).build();

// ─── Command Processor Tests ─────────────────────────────────────────────────

describe("SqliteCommand", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;
  let command: SqliteCommand<any>;

  const table = SQLiteTable.make({ tableName: "command_test" })
    .primary("pk", "sk")
    .index("IDX1", "IDX1PK", "IDX1SK")
    .build();

  const userEntity = SQLiteEntity.make(table)
    .eschema(UserSchema)
    .primary()
    .index("IDX1", "byEmail", { pk: ["email"] })
    .build();

  const postEntity = SQLiteEntity.make(table)
    .eschema(PostSchema)
    .primary({ pk: ["authorId"] })
    .build();

  const registry = EntityRegistry.make(table)
    .register(userEntity)
    .register(postEntity)
    .build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(registry.setup().pipe(Effect.provide(layer)));
    command = SqliteCommand.make(registry);
  });

  afterAll(() => db.close());

  describe("insert operation", () => {
    it.effect("inserts a new entity", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "insert",
          entity: "User",
          data: {
            userId: "cmd-user-1",
            email: "cmd@example.com",
            name: "Command User",
          },
        });

        expect(result.operation).toBe("insert");
        expect(result.entity).toBe("User");
        expect(result.data.value).toMatchObject({
          userId: "cmd-user-1",
          email: "cmd@example.com",
          name: "Command User",
        });
        expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("returns timing information", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "insert",
          entity: "User",
          data: {
            userId: "timing-user",
            email: "timing@example.com",
            name: "Timing User",
          },
        });

        expect(result.timing.startedAt).toBeGreaterThan(0);
        expect(result.timing.completedAt).toBeGreaterThanOrEqual(result.timing.startedAt);
        expect(result.timing.durationMs).toBe(
          result.timing.completedAt - result.timing.startedAt,
        );
      }).pipe(Effect.provide(layer)),
    );

    it("throws for non-existent entity in registry", async () => {
      await expect(
        Effect.runPromise(
          command
            .process({
              operation: "insert",
              entity: "NonExistent",
              data: { id: "1" },
            })
            .pipe(Effect.provide(layer)),
        ),
      ).rejects.toThrow('Entity "NonExistent" not found in registry');
    });
  });

  describe("update operation", () => {
    it.effect("updates an existing entity", () =>
      Effect.gen(function* () {
        yield* command.process({
          operation: "insert",
          entity: "User",
          data: {
            userId: "update-user-1",
            email: "before@example.com",
            name: "Before",
          },
        });

        const result = yield* command.process({
          operation: "update",
          entity: "User",
          key: { userId: "update-user-1" },
          data: { name: "After" },
        });

        expect(result.operation).toBe("update");
        expect(result.entity).toBe("User");
        expect(result.data.value).toMatchObject({
          userId: "update-user-1",
          email: "before@example.com",
          name: "After",
        });
      }).pipe(Effect.provide(layer)),
    );

    it.effect("fails for non-existent entity", () =>
      Effect.gen(function* () {
        const error = yield* command
          .process({
            operation: "update",
            entity: "User",
            key: { userId: "non-existent" },
            data: { name: "X" },
          })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(CommandError);
        expect(error.operation).toBe("update");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("delete operation", () => {
    it.effect("soft deletes an existing entity", () =>
      Effect.gen(function* () {
        yield* command.process({
          operation: "insert",
          entity: "User",
          data: {
            userId: "delete-user-1",
            email: "delete@example.com",
            name: "Delete Me",
          },
        });

        const result = yield* command.process({
          operation: "delete",
          entity: "User",
          key: { userId: "delete-user-1" },
        });

        expect(result.operation).toBe("delete");
        expect(result.entity).toBe("User");
        expect(result.data.meta._d).toBe(true);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("fails for non-existent entity", () =>
      Effect.gen(function* () {
        const error = yield* command
          .process({
            operation: "delete",
            entity: "User",
            key: { userId: "non-existent-delete" },
          })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(CommandError);
        expect(error.operation).toBe("delete");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("query operation", () => {
    beforeAll(async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* command.process({
            operation: "insert",
            entity: "Post",
            data: {
              postId: "post-a",
              authorId: "query-author",
              title: "Post A",
              content: "Content A",
            },
          });
          yield* command.process({
            operation: "insert",
            entity: "Post",
            data: {
              postId: "post-b",
              authorId: "query-author",
              title: "Post B",
              content: "Content B",
            },
          });
          yield* command.process({
            operation: "insert",
            entity: "Post",
            data: {
              postId: "post-c",
              authorId: "query-author",
              title: "Post C",
              content: "Content C",
            },
          });
        }).pipe(Effect.provide(layer)),
      );
    });

    it.effect("queries entities by primary index", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "query",
          entity: "Post",
          index: "primary",
          pk: { authorId: "query-author" },
          sk: { ">=": null },
        });

        expect(result.operation).toBe("query");
        expect(result.entity).toBe("Post");
        expect(result.items.length).toBeGreaterThanOrEqual(3);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("queries with sk condition", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "query",
          entity: "Post",
          index: "primary",
          pk: { authorId: "query-author" },
          sk: { ">=": "post-b" },
        });

        const postIds = result.items.map((i: any) => i.value.postId);
        expect(postIds).toContain("post-b");
        expect(postIds).toContain("post-c");
        expect(postIds).not.toContain("post-a");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("queries with limit", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "query",
          entity: "Post",
          index: "primary",
          pk: { authorId: "query-author" },
          sk: { ">=": null },
          limit: 2,
        });

        expect(result.items).toHaveLength(2);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("queries by secondary index", () =>
      Effect.gen(function* () {
        yield* command.process({
          operation: "insert",
          entity: "User",
          data: {
            userId: "idx-user",
            email: "indexed@example.com",
            name: "Indexed User",
          },
        });

        const result = yield* command.process({
          operation: "query",
          entity: "User",
          index: "byEmail",
          pk: { email: "indexed@example.com" },
          sk: { ">=": null },
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]!.value).toMatchObject({
          userId: "idx-user",
          email: "indexed@example.com",
        });
      }).pipe(Effect.provide(layer)),
    );

    it.effect("returns empty array for non-existent partition", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "query",
          entity: "Post",
          index: "primary",
          pk: { authorId: "non-existent-author" },
          sk: { ">=": null },
        });

        expect(result.items).toHaveLength(0);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("descriptor operation", () => {
    it.effect("returns all entity descriptors", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "descriptor",
        });

        expect(result.operation).toBe("descriptor");
        expect(result.descriptors).toHaveLength(2);

        const names = result.descriptors.map((d: any) => d.name);
        expect(names).toContain("User");
        expect(names).toContain("Post");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("includes timing information", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "descriptor",
        });

        expect(result.timing.startedAt).toBeGreaterThan(0);
        expect(result.timing.completedAt).toBeGreaterThanOrEqual(result.timing.startedAt);
        expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("returns correct schema structure for each entity", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "descriptor",
        });

        const userDesc = result.descriptors.find((d: any) => d.name === "User");
        expect(userDesc).toBeDefined();
        expect(userDesc!.version).toBe("v1");
        expect(userDesc!.primaryIndex).toBeDefined();
        expect(userDesc!.primaryIndex.pk.pattern).toContain("User");
        expect(userDesc!.schema).toBeDefined();

        const postDesc = result.descriptors.find((d: any) => d.name === "Post");
        expect(postDesc).toBeDefined();
        expect(postDesc!.primaryIndex.pk.deps).toContain("authorId");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("includes secondary index descriptors", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "descriptor",
        });

        const userDesc = result.descriptors.find((d: any) => d.name === "User");
        expect(userDesc).toBeDefined();
        expect(userDesc!.secondaryIndexes).toHaveLength(1);
        expect(userDesc!.secondaryIndexes[0]!.name).toBe("byEmail");
        expect(userDesc!.secondaryIndexes[0]!.pk.deps).toContain("email");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("toRpcHandler", () => {
    it("returns handler object with default prefix", () => {
      const handlers = command.toRpcHandler();

      expect(handlers).toHaveProperty("__std-toolkit__command");
      expect(typeof handlers["__std-toolkit__command"]).toBe("function");
    });

    it("returns handler object with custom suffix", () => {
      const handlers = command.toRpcHandler("Admin");

      expect(handlers).toHaveProperty("__std-toolkit__commandAdmin");
      expect(typeof handlers["__std-toolkit__commandAdmin"]).toBe("function");
    });

    it.effect("handler processes commands correctly", () =>
      Effect.gen(function* () {
        const handlers = command.toRpcHandler();
        const handler = handlers["__std-toolkit__command"];

        const result = yield* handler({
          operation: "insert",
          entity: "User",
          data: {
            userId: "rpc-user",
            email: "rpc@example.com",
            name: "RPC User",
          },
        });

        expect(result.operation).toBe("insert");
        expect((result as { entity: string }).entity).toBe("User");
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("registry access", () => {
    it("provides access to the registry", () => {
      expect(command.registry).toBe(registry);
    });

    it("static RPC_PREFIX is correct", () => {
      expect(SqliteCommand.RPC_PREFIX).toBe("__std-toolkit__command");
    });
  });
});

// ─── Error Handling Tests ────────────────────────────────────────────────────

describe("SqliteCommand Error Handling", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;
  let command: SqliteCommand<any>;

  const table = SQLiteTable.make({ tableName: "error_test" })
    .primary("pk", "sk")
    .build();

  const SimpleSchema = ESchema.make("Simple", "id", {
    value: Schema.String,
  }).build();

  const simpleEntity = SQLiteEntity.make(table)
    .eschema(SimpleSchema)
    .primary()
    .build();

  const registry = EntityRegistry.make(table).register(simpleEntity).build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(registry.setup().pipe(Effect.provide(layer)));
    command = SqliteCommand.make(registry);
  });

  afterAll(() => db.close());

  it.effect("CommandError includes operation type", () =>
    Effect.gen(function* () {
      const error = yield* command
        .process({
          operation: "update",
          entity: "Simple",
          key: { id: "not-found" },
          data: { value: "x" },
        })
        .pipe(Effect.flip);

      expect(error.operation).toBe("update");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("CommandError includes entity name", () =>
    Effect.gen(function* () {
      const error = yield* command
        .process({
          operation: "delete",
          entity: "Simple",
          key: { id: "not-found" },
        })
        .pipe(Effect.flip);

      expect(error.entity).toBe("Simple");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("CommandError includes descriptive message", () =>
    Effect.gen(function* () {
      const error = yield* command
        .process({
          operation: "update",
          entity: "Simple",
          key: { id: "not-found" },
          data: { value: "x" },
        })
        .pipe(Effect.flip);

      expect(error.message).toContain("Update failed");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("CommandError includes cause", () =>
    Effect.gen(function* () {
      const error = yield* command
        .process({
          operation: "update",
          entity: "Simple",
          key: { id: "not-found" },
          data: { value: "x" },
        })
        .pipe(Effect.flip);

      expect(error.cause).toBeDefined();
    }).pipe(Effect.provide(layer)),
  );
});

// ─── Cross-Entity Command Tests ──────────────────────────────────────────────

describe("SqliteCommand Cross-Entity Operations", () => {
  let db: Database.Database;
  let layer: Layer.Layer<SqliteDB>;
  let command: SqliteCommand<any>;

  const table = SQLiteTable.make({ tableName: "cross_entity" })
    .primary("pk", "sk")
    .build();

  const EntityASchema = ESchema.make("EntityA", "aId", {
    value: Schema.String,
  }).build();

  const EntityBSchema = ESchema.make("EntityB", "bId", {
    ref: Schema.String,
  }).build();

  const entityA = SQLiteEntity.make(table)
    .eschema(EntityASchema)
    .primary()
    .build();

  const entityB = SQLiteEntity.make(table)
    .eschema(EntityBSchema)
    .primary()
    .build();

  const registry = EntityRegistry.make(table)
    .register(entityA)
    .register(entityB)
    .build();

  beforeAll(async () => {
    db = new Database(":memory:");
    layer = SqliteDBBetterSqlite3(db);
    await Effect.runPromise(registry.setup().pipe(Effect.provide(layer)));
    command = SqliteCommand.make(registry);
  });

  afterAll(() => db.close());

  it.effect("processes commands for multiple entity types", () =>
    Effect.gen(function* () {
      const resultA = yield* command.process({
        operation: "insert",
        entity: "EntityA",
        data: { aId: "a-1", value: "hello" },
      });

      const resultB = yield* command.process({
        operation: "insert",
        entity: "EntityB",
        data: { bId: "b-1", ref: "a-1" },
      });

      expect(resultA.entity).toBe("EntityA");
      expect(resultB.entity).toBe("EntityB");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("maintains entity isolation in queries", () =>
    Effect.gen(function* () {
      yield* command.process({
        operation: "insert",
        entity: "EntityA",
        data: { aId: "iso-a", value: "isolated" },
      });

      yield* command.process({
        operation: "insert",
        entity: "EntityB",
        data: { bId: "iso-b", ref: "isolated" },
      });

      const queryA = yield* command.process({
        operation: "query",
        entity: "EntityA",
        index: "primary",
        pk: {},
        sk: { ">=": null },
      });

      const queryB = yield* command.process({
        operation: "query",
        entity: "EntityB",
        index: "primary",
        pk: {},
        sk: { ">=": null },
      });

      const aIds = queryA.items.map((i: any) => i.meta._e);
      const bIds = queryB.items.map((i: any) => i.meta._e);

      expect(aIds.every((e: string) => e === "EntityA")).toBe(true);
      expect(bIds.every((e: string) => e === "EntityB")).toBe(true);
    }).pipe(Effect.provide(layer)),
  );
});
