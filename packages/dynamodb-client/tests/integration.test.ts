import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { createDynamoDB } from "../src/index.js";
import {
  assertSuccessSync,
  expectEffect,
  runEffectTest,
  testEither
} from "./effect-test-utils.js";

describe("dynamoDB Integration", () => {
  const dynamodb = createDynamoDB({
    region: "us-east-1",
    endpoint: "http://localhost:8000",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  });

  it("should connect to local DynamoDB and list tables", async () => {
    const program = dynamodb.listTables({ Limit: 10 }).pipe(
      assertSuccessSync((result) => {
        expect(result).toBeDefined();
        expect(result.TableNames).toBeDefined();
        expect(Array.isArray(result.TableNames)).toBe(true);
      }),
    );

    const either = await runEffectTest(program);
    expect(Either.isRight(either)).toBe(true);
  }, 10000); // 10 second timeout for connection

  it("should handle service calls with proper typing", async () => {
    const program = Effect.gen(function* () {
      const either = yield* Effect.either(dynamodb.listTables({}));

      yield* testEither(
        Effect.succeed(either),
        (result) => Effect.gen(function* () {
          if (Either.isRight(result)) {
            yield* expectEffect(() => expect(typeof result.right.TableNames).toBe("object"));
            if (result.right.LastEvaluatedTableName) {
              yield* expectEffect(() => expect(typeof result.right.LastEvaluatedTableName).toBe("string"));
            }
          }
        }),
        (error) => Effect.gen(function* () {
          // Should not reach here in normal operation
          yield* Effect.die(new Error(`Unexpected failure: ${JSON.stringify(error)}`));
        }),
      );
    });

    const either = await runEffectTest(program);
    expect(Either.isRight(either)).toBe(true);
  });
});

