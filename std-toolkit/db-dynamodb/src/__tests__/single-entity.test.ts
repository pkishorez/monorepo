import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import { DynamoTable, DynamoSingleEntity } from "../index.js";
import { createDynamoDB } from "../services/dynamo-client.js";

const TEST_TABLE_NAME = `db-dynamodb-single-entity-test-${Date.now()}`;
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

const table = DynamoTable.make(localConfig).primary("pk", "sk").build();

const configSchema = ESchema.make("AppConfig", "configId", {
  theme: Schema.String,
  maxRetries: Schema.Number,
}).build();

const AppConfig = DynamoSingleEntity.make(table)
  .eschema(configSchema)
  .default({ theme: "light", maxRetries: 3 });

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
}

async function deleteTestTable() {
  try {
    const client = createDynamoDB(localConfig);
    await Effect.runPromise(client.deleteTable({ TableName: TEST_TABLE_NAME }));
  } catch {
    // Ignore cleanup errors
  }
}

describe("DynamoSingleEntity", () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  describe("get", () => {
    it.effect("returns default when item is absent", () =>
      Effect.gen(function* () {
        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe("light");
        expect(result.value.maxRetries).toBe(3);
        expect(result.meta._uid).toBe("");
        expect(result.meta._e).toBe("AppConfig");
      }),
    );

    it.effect("returns stored item after put", () =>
      Effect.gen(function* () {
        yield* AppConfig.put({
          theme: "dark",
          maxRetries: 5,
        });

        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe("dark");
        expect(result.value.maxRetries).toBe(5);
        expect(result.meta._uid).not.toBe("");
        expect(result.meta._e).toBe("AppConfig");
      }),
    );
  });

  describe("put", () => {
    it.effect("writes unconditionally", () =>
      Effect.gen(function* () {
        const result = yield* AppConfig.put({
          theme: "blue",
          maxRetries: 10,
        });

        expect(result.value.theme).toBe("blue");
        expect(result.value.maxRetries).toBe(10);
        expect(result.meta._uid).not.toBe("");
      }),
    );

    it.effect("overwrites existing item", () =>
      Effect.gen(function* () {
        yield* AppConfig.put({
          theme: "red",
          maxRetries: 1,
        });

        yield* AppConfig.put({
          theme: "green",
          maxRetries: 99,
        });

        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe("green");
        expect(result.value.maxRetries).toBe(99);
      }),
    );
  });

  describe("update", () => {
    it.effect("updates with plain object patch", () =>
      Effect.gen(function* () {
        yield* AppConfig.put({
          theme: "light",
          maxRetries: 3,
        });

        const result = yield* AppConfig.update({
          update: { theme: "dark" },
        });

        expect(result.value.theme).toBe("dark");
        expect(result.value.maxRetries).toBe(3);
      }),
    );

    it.effect("updates with expression builder (opAdd)", () =>
      Effect.gen(function* () {
        yield* AppConfig.put({
          theme: "light",
          maxRetries: 3,
        });

        const result = yield* AppConfig.update({
          update: ($) => [$.set("maxRetries", $.opAdd("maxRetries", 1))],
        });

        expect(result.value.maxRetries).toBe(4);
      }),
    );

    it.effect("fails with NoItemToUpdate on non-existent item", () =>
      Effect.gen(function* () {
        const emptySchema = ESchema.make("EmptyConfig", "id", {
          value: Schema.String,
        }).build();

        const EmptyConfig = DynamoSingleEntity.make(table)
          .eschema(emptySchema)
          .default({ value: "x" });

        const error = yield* EmptyConfig.update({
          update: { value: "y" },
        }).pipe(Effect.flip);

        expect(error.error._tag).toBe("NoItemToUpdate");
      }),
    );
  });
});
