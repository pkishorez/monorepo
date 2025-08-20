import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createDynamoDB } from "../src/index.js";

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
    const result = await Effect.runPromise(dynamodb.listTables({ Limit: 10 }));

    expect(result).toBeDefined();
    expect(result.TableNames).toBeDefined();
    expect(Array.isArray(result.TableNames)).toBe(true);
  }, 10000); // 10 second timeout for connection

  it("should handle service calls with proper typing", async () => {
    const result = await Effect.runPromise(dynamodb.listTables({}));

    // Test that the TypeScript types are working correctly
    expect(typeof result.TableNames).toBe("object");
    if (result.LastEvaluatedTableName) {
      expect(typeof result.LastEvaluatedTableName).toBe("string");
    }
  });
});

