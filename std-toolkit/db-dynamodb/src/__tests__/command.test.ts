import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import { DynamoTable, DynamoEntity, EntityRegistry } from "../index.js";
import { DynamoCommand } from "../services/dynamo-command.js";
import { createDynamoDB } from "../services/dynamo-client.js";
import { CommandError } from "@std-toolkit/core/command";

const TEST_TABLE_NAME = `db-dynamodb-command-test-${Date.now()}`;
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

// ─── Table and Entities Setup ────────────────────────────────────────────────

const table = DynamoTable.make(localConfig)
  .primary("pk", "sk")
  .gsi("GSI1", "GSI1PK", "GSI1SK")
  .build();

const userEntity = DynamoEntity.make(table)
  .eschema(UserSchema)
  .primary()
  .index("GSI1", "byEmail", { pk: ["email"] })
  .build();

const postEntity = DynamoEntity.make(table)
  .eschema(PostSchema)
  .primary({ pk: ["authorId"] })
  .build();

const registry = EntityRegistry.make(table)
  .register(userEntity)
  .register(postEntity)
  .build();

const command = DynamoCommand.make(registry);

// ─── Helper Functions ────────────────────────────────────────────────────────

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

// ─── Command Processor Tests ─────────────────────────────────────────────────

describe("DynamoCommand", () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await deleteTestTable();
  });

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
      }),
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
      }),
    );

    it("throws for non-existent entity in registry", async () => {
      await expect(
        Effect.runPromise(
          command.process({
            operation: "insert",
            entity: "NonExistent",
            data: { id: "1" },
          }),
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
      }),
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
      }),
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
      }),
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
      }),
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
        }),
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
      }),
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
      }),
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
      }),
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
        expect(result.items[0].value).toMatchObject({
          userId: "idx-user",
          email: "indexed@example.com",
        });
      }),
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
      }),
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
      }),
    );

    it.effect("includes timing information", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "descriptor",
        });

        expect(result.timing.startedAt).toBeGreaterThan(0);
        expect(result.timing.completedAt).toBeGreaterThanOrEqual(result.timing.startedAt);
        expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
      }),
    );

    it.effect("returns correct schema structure for each entity", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "descriptor",
        });

        const userDesc = result.descriptors.find((d: any) => d.name === "User");
        expect(userDesc).toBeDefined();
        expect(userDesc.version).toBe("v1");
        expect(userDesc.primaryIndex).toBeDefined();
        expect(userDesc.primaryIndex.pk.pattern).toContain("User");
        expect(userDesc.schema).toBeDefined();

        const postDesc = result.descriptors.find((d: any) => d.name === "Post");
        expect(postDesc).toBeDefined();
        expect(postDesc.primaryIndex.pk.deps).toContain("authorId");
      }),
    );

    it.effect("includes secondary index descriptors", () =>
      Effect.gen(function* () {
        const result = yield* command.process({
          operation: "descriptor",
        });

        const userDesc = result.descriptors.find((d: any) => d.name === "User");
        expect(userDesc.secondaryIndexes).toHaveLength(1);
        expect(userDesc.secondaryIndexes[0].name).toBe("byEmail");
        expect(userDesc.secondaryIndexes[0].pk.deps).toContain("email");
      }),
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
        expect(result.entity).toBe("User");
      }),
    );
  });

  describe("registry access", () => {
    it("provides access to the registry", () => {
      expect(command.registry).toBe(registry);
    });

    it("static RPC_PREFIX is correct", () => {
      expect(DynamoCommand.RPC_PREFIX).toBe("__std-toolkit__command");
    });
  });

  describe("error handling", () => {
    it.effect("CommandError includes operation type", () =>
      Effect.gen(function* () {
        const error = yield* command
          .process({
            operation: "update",
            entity: "User",
            key: { userId: "error-test-not-found" },
            data: { name: "x" },
          })
          .pipe(Effect.flip);

        expect(error.operation).toBe("update");
      }),
    );

    it.effect("CommandError includes entity name", () =>
      Effect.gen(function* () {
        const error = yield* command
          .process({
            operation: "delete",
            entity: "User",
            key: { userId: "error-test-not-found-2" },
          })
          .pipe(Effect.flip);

        expect(error.entity).toBe("User");
      }),
    );

    it.effect("CommandError includes descriptive message", () =>
      Effect.gen(function* () {
        const error = yield* command
          .process({
            operation: "update",
            entity: "User",
            key: { userId: "error-test-not-found-3" },
            data: { name: "x" },
          })
          .pipe(Effect.flip);

        expect(error.message).toContain("Update failed");
      }),
    );

    it.effect("CommandError includes cause", () =>
      Effect.gen(function* () {
        const error = yield* command
          .process({
            operation: "update",
            entity: "User",
            key: { userId: "error-test-not-found-4" },
            data: { name: "x" },
          })
          .pipe(Effect.flip);

        expect(error.cause).toBeDefined();
      }),
    );
  });

  describe("cross-entity operations", () => {
    it.effect("processes commands for multiple entity types", () =>
      Effect.gen(function* () {
        const resultUser = yield* command.process({
          operation: "insert",
          entity: "User",
          data: {
            userId: "cross-user-1",
            email: "cross@example.com",
            name: "Cross User",
          },
        });

        const resultPost = yield* command.process({
          operation: "insert",
          entity: "Post",
          data: {
            postId: "cross-post-1",
            authorId: "cross-user-1",
            title: "Cross Post",
            content: "Content",
          },
        });

        expect(resultUser.entity).toBe("User");
        expect(resultPost.entity).toBe("Post");
      }),
    );

    it.effect("maintains entity isolation in queries", () =>
      Effect.gen(function* () {
        yield* command.process({
          operation: "insert",
          entity: "User",
          data: {
            userId: "iso-user",
            email: "isolated@example.com",
            name: "Isolated User",
          },
        });

        yield* command.process({
          operation: "insert",
          entity: "Post",
          data: {
            postId: "iso-post",
            authorId: "iso-author",
            title: "Isolated Post",
            content: "Isolated Content",
          },
        });

        const userQuery = yield* command.process({
          operation: "query",
          entity: "User",
          index: "primary",
          pk: {},
          sk: { ">=": null },
        });

        const postQuery = yield* command.process({
          operation: "query",
          entity: "Post",
          index: "primary",
          pk: { authorId: "iso-author" },
          sk: { ">=": null },
        });

        const userEntities = userQuery.items.map((i: any) => i.meta._e);
        const postEntities = postQuery.items.map((i: any) => i.meta._e);

        expect(userEntities.every((e: string) => e === "User")).toBe(true);
        expect(postEntities.every((e: string) => e === "Post")).toBe(true);
      }),
    );
  });
});
