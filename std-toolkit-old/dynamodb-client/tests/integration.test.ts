import { Either } from "effect";
import { describe, expect, it } from "vitest";
import { createDynamoDB } from "../src/index.js";
import {
  assertSuccessSync,
  runEffectTest,
} from "./effect-test-utils.js";

describe("dynamoDB basic integration", () => {
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
  }, 10000);

  it("should handle error cases gracefully", async () => {
    // Test with invalid table name to verify error handling
    const program = dynamodb.describeTable({ TableName: "non-existent-table" });

    const either = await runEffectTest(program);
    expect(Either.isLeft(either)).toBe(true);

    if (Either.isLeft(either)) {
      // Should be a ResourceNotFound error or similar
      expect(either.left).toBeDefined();
    }
  });
});

