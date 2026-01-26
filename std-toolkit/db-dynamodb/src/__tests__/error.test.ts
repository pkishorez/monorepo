import { describe, it, expect, beforeAll, afterAll } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import { DynamoTable, DynamoEntity, DynamodbError } from "../index.js";
import { createDynamoDB } from "../services/DynamoClient.js";

const TEST_TABLE_NAME = `db-dynamodb-error-test-${Date.now()}`;
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

const userSchema = ESchema.make("User", {
  id: Schema.String,
  name: Schema.String,
}).build();

const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({
    pk: {
      deps: ["id"],
      derive: (v) => [`USER#${v.id}`],
    },
    sk: {
      deps: [],
      derive: () => ["PROFILE"],
    },
  })
  .build();

async function createTestTable() {
  const client = createDynamoDB({
    tableName: TEST_TABLE_NAME,
    region: localConfig.region,
    credentials: localConfig.credentials,
    endpoint: LOCAL_ENDPOINT,
  });

  const createParams = {
    TableName: TEST_TABLE_NAME,
    KeySchema: [
      { AttributeName: "pk", KeyType: "HASH" as const },
      { AttributeName: "sk", KeyType: "RANGE" as const },
    ],
    AttributeDefinitions: [
      { AttributeName: "pk", AttributeType: "S" as const },
      { AttributeName: "sk", AttributeType: "S" as const },
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
    await Effect.runPromise(
      client.deleteTable({ TableName: TEST_TABLE_NAME }),
    );
  } catch {
    // Ignore cleanup errors
  }
}

describe("DynamoDB Error Handling", () => {
  beforeAll(async () => {
    await createTestTable();
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  describe("Entity.insert - ItemAlreadyExists", () => {
    it.effect("fails with ItemAlreadyExists when inserting duplicate item", () =>
      Effect.gen(function* () {
        const user = { id: "duplicate-test", name: "Test User" };

        yield* UserEntity.insert(user);

        const error = yield* UserEntity.insert(user).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("ItemAlreadyExists");
      }),
    );

    it.effect("succeeds with ignoreIfAlreadyPresent option", () =>
      Effect.gen(function* () {
        const user = { id: "ignore-duplicate-test", name: "Test User" };

        yield* UserEntity.insert(user);
        yield* UserEntity.insert(user, { ignoreIfAlreadyPresent: true });

        const result = yield* UserEntity.get({ id: user.id });
        expect(result?.value.name).toBe("Test User");
      }),
    );
  });

  describe("Entity.update - NoItemToUpdate", () => {
    it.effect("fails with NoItemToUpdate when updating non-existent item", () =>
      Effect.gen(function* () {
        const error = yield* UserEntity.update(
          { id: "non-existent-id" },
          { name: "Updated Name" },
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("NoItemToUpdate");
      }),
    );

    it.effect("fails with NoItemToUpdate when item exists but version mismatch", () =>
      Effect.gen(function* () {
        const user = { id: "version-mismatch-test", name: "Original" };
        yield* UserEntity.insert(user);

        yield* UserEntity.update({ id: user.id }, { name: "Updated Once" });

        const error = yield* UserEntity.update(
          { id: user.id },
          { name: "Updated Again" },
          { meta: { _i: 0 } },
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("NoItemToUpdate");
      }),
    );
  });

  describe("Table operations with non-existent table", () => {
    const badTable = DynamoTable.make({
      ...localConfig,
      tableName: "non-existent-table",
    })
      .primary("pk", "sk")
      .build();

    it.effect("fails with QueryFailed when querying non-existent table", () =>
      Effect.gen(function* () {
        const error = yield* badTable
          .query({ pk: "TEST#1" })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("QueryFailed");
      }),
    );

    it.effect("fails with GetItemFailed when getting item from non-existent table", () =>
      Effect.gen(function* () {
        const error = yield* badTable
          .getItem({ pk: "TEST#1", sk: "ITEM#1" })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("GetItemFailed");
      }),
    );

    it.effect("fails with PutItemFailed when putting item to non-existent table", () =>
      Effect.gen(function* () {
        const error = yield* badTable
          .putItem({ pk: "TEST#1", sk: "ITEM#1", data: "test" })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("PutItemFailed");
      }),
    );

    it.effect("fails with DeleteItemFailed when deleting item from non-existent table", () =>
      Effect.gen(function* () {
        const error = yield* badTable
          .deleteItem({ pk: "TEST#1", sk: "ITEM#1" })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("DeleteItemFailed");
      }),
    );

    it.effect("fails with ScanFailed when scanning non-existent table", () =>
      Effect.gen(function* () {
        const error = yield* badTable.scan().pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("ScanFailed");
      }),
    );
  });

  describe("Entity operations with non-existent table", () => {
    const badTable = DynamoTable.make({
      ...localConfig,
      tableName: "non-existent-entity-table",
    })
      .primary("pk", "sk")
      .build();

    const BadUserEntity = DynamoEntity.make(badTable)
      .eschema(userSchema)
      .primary({
        pk: {
          deps: ["id"],
          derive: (v) => [`USER#${v.id}`],
        },
        sk: {
          deps: [],
          derive: () => ["PROFILE"],
        },
      })
      .build();

    it.effect("fails with PutItemFailed when inserting entity on non-existent table", () =>
      Effect.gen(function* () {
        const error = yield* BadUserEntity.insert({
          id: "1",
          name: "Test",
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("PutItemFailed");
      }),
    );

    it.effect("fails with GetItemFailed when getting entity from non-existent table", () =>
      Effect.gen(function* () {
        const error = yield* BadUserEntity.get({ id: "1" }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("GetItemFailed");
      }),
    );

    it.effect("fails with QueryFailed when querying entity on non-existent table", () =>
      Effect.gen(function* () {
        const error = yield* BadUserEntity.query({ pk: { id: "1" } }).pipe(
          Effect.flip,
        );

        expect(error).toBeInstanceOf(DynamodbError);
        expect(error.error._tag).toBe("QueryFailed");
      }),
    );
  });

  describe("Error cause preservation", () => {
    const badTable = DynamoTable.make({
      ...localConfig,
      tableName: "non-existent-cause-table",
    })
      .primary("pk", "sk")
      .build();

    it.effect("preserves underlying AWS error details in cause", () =>
      Effect.gen(function* () {
        const error = yield* badTable
          .getItem({ pk: "TEST#1", sk: "ITEM#1" })
          .pipe(Effect.flip);

        expect(error.error._tag).toBe("GetItemFailed");
        if (error.error._tag === "GetItemFailed") {
          expect(error.error.cause).toBeDefined();
          expect(error.error.cause).toBeInstanceOf(DynamodbError);
          const innerError = error.error.cause as DynamodbError;
          expect(innerError.error._tag).toBe("UnknownAwsError");
          if (innerError.error._tag === "UnknownAwsError") {
            expect(innerError.error.name).toBe("ResourceNotFoundException");
          }
        }
      }),
    );
  });
});
