import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { EntityESchema } from "@std-toolkit/eschema";
import { DynamoTable, DynamoEntity } from "../index.js";
import { createDynamoDB } from "../services/dynamo-client.js";
import { DynamodbError } from "../errors.js";

const TEST_TABLE_NAME = `db-dynamodb-expr-update-test-${Date.now()}`;
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

const table = DynamoTable.make(localConfig)
  .primary("pk", "sk")
  .gsi("GSI1", "GSI1PK", "GSI1SK")
  .build();

const playerSchema = EntityESchema.make("Player", "playerId", {
  teamId: Schema.String,
  name: Schema.String,
  score: Schema.Number,
  loginCount: Schema.Number,
  tags: Schema.Array(Schema.String),
  history: Schema.Array(Schema.Struct({ action: Schema.String })),
}).build();

const PlayerEntity = DynamoEntity.make(table)
  .eschema(playerSchema)
  .primary({ pk: ["teamId"] })
  .index("GSI1", "byName", { pk: ["name"] })
  .build();

async function createTestTable() {
  const client = createDynamoDB(localConfig);

  await Effect.runPromise(
    client
      .createTable({
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
      })
      .pipe(
        Effect.catchAll((e) => {
          const errorName = (e as any)?.error?.name;
          if (errorName === "ResourceInUseException") return Effect.void;
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

describe("Entity update with expression builder", () => {
  beforeAll(async () => {
    await createTestTable();

    await Effect.runPromise(
      PlayerEntity.insert({
        teamId: "team-1",
        playerId: "player-1",
        name: "Alice",
        score: 100,
        loginCount: 5,
        tags: ["member"],
        history: [{ action: "joined" }],
      }),
    );
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  it.effect("opAdd increments a numeric field", () =>
    Effect.gen(function* () {
      const result = yield* PlayerEntity.update(
        { teamId: "team-1", playerId: "player-1" },
        { update: ($) => [$.set("score", $.opAdd("score", 10))] },
      );
      expect(result.value.score).toBe(110);
    }),
  );

  it.effect("opIfNotExists sets value only if missing", () =>
    Effect.gen(function* () {
      const result = yield* PlayerEntity.update(
        { teamId: "team-1", playerId: "player-1" },
        { update: ($) => [$.set("loginCount", $.opIfNotExists("loginCount", 0))] },
      );
      expect(result.value.loginCount).toBe(5);
    }),
  );

  it.effect("append adds items to end of list", () =>
    Effect.gen(function* () {
      const result = yield* PlayerEntity.update(
        { teamId: "team-1", playerId: "player-1" },
        { update: ($) => [$.append("tags", ["admin"])] },
      );
      expect(result.value.tags).toEqual(["member", "admin"]);
    }),
  );

  it.effect("prepend adds items to beginning of list", () =>
    Effect.gen(function* () {
      const result = yield* PlayerEntity.update(
        { teamId: "team-1", playerId: "player-1" },
        { update: ($) => [$.prepend("history", [{ action: "login" }])] },
      );
      expect(result.value.history[0]).toEqual({ action: "login" });
      expect(result.value.history[1]).toEqual({ action: "joined" });
    }),
  );

  it.effect("mixed operations in single update", () =>
    Effect.gen(function* () {
      const before = yield* PlayerEntity.get({
        teamId: "team-1",
        playerId: "player-1",
      });

      const result = yield* PlayerEntity.update(
        { teamId: "team-1", playerId: "player-1" },
        { update: ($) => [
          $.set("score", $.opAdd("score", 5)),
          $.append("tags", ["vip"]),
        ] },
      );

      expect(result.value.score).toBe(before!.value.score + 5);
      expect(result.value.tags).toContain("vip");
    }),
  );

  it.effect("auto-injects _uid on expression builder updates", () =>
    Effect.gen(function* () {
      const before = yield* PlayerEntity.get({
        teamId: "team-1",
        playerId: "player-1",
      });

      const result = yield* PlayerEntity.update(
        { teamId: "team-1", playerId: "player-1" },
        { update: ($) => [$.set("score", $.opAdd("score", 1))] },
      );

      expect(result.meta._uid).not.toBe(before!.meta._uid);
    }),
  );

  it.effect("throws when expression builder targets a derivation dep field", () =>
    Effect.gen(function* () {
      const result = yield* PlayerEntity.update(
        { teamId: "team-1", playerId: "player-1" },
        { update: ($) => [$.set("name" as any, "Bob" as any)] },
      ).pipe(Effect.flip);

      expect(result).toBeInstanceOf(DynamodbError);
      expect(result.error._tag).toBe("UpdateItemFailed");
      expect((result.error as any).cause).toMatch(/derivation dependency/);
    }),
  );

  it.effect("plain partial update still works", () =>
    Effect.gen(function* () {
      const result = yield* PlayerEntity.update(
        { teamId: "team-1", playerId: "player-1" },
        { update: { score: 999 } },
      );
      expect(result.value.score).toBe(999);
    }),
  );
});
