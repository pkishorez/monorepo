import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDynamoDB } from "../src/index.js";

// Test configuration for local DynamoDB
const TEST_CONFIG = {
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
};

const dynamodb = createDynamoDB(TEST_CONFIG);

// Test table name
const TEST_TABLE_NAME = "test-dynamodb-client";

// Test data types
interface TestUser {
  userId: string;
  email: string;
  name: string;
  age?: number;
  tags?: string[];
}

describe("dynamoDB Client", () => {
  beforeAll(async () => {
    // Create test table
    try {
      await Effect.runPromise(
        dynamodb.createTable({
          TableName: TEST_TABLE_NAME,
          KeySchema: [
            {
              AttributeName: "userId",
              KeyType: "HASH",
            },
          ],
          AttributeDefinitions: [
            {
              AttributeName: "userId",
              AttributeType: "S",
            },
            {
              AttributeName: "email",
              AttributeType: "S",
            },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: "EmailIndex",
              KeySchema: [
                {
                  AttributeName: "email",
                  KeyType: "HASH",
                },
              ],
              Projection: {
                ProjectionType: "ALL",
              },
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
        }),
      );

      // Wait for table to be active
      let tableReady = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!tableReady && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const response = await Effect.runPromise(
            dynamodb.describeTable({ TableName: TEST_TABLE_NAME }),
          );
          tableReady = response.Table?.TableStatus === "ACTIVE";
        } catch {
          // Continue waiting
        }
        attempts++;
      }

      if (!tableReady) {
        throw new Error("Test table failed to become active");
      }
    } catch (error) {
      // Table might already exist, which is fine for testing
      if (
        !(error instanceof Error) ||
        !error.message.includes("already exists")
      ) {
        console.warn("Failed to create test table:", error);
      }
    }
  });

  beforeEach(async () => {
    // Clean up any existing test data
    try {
      const scanResult = await Effect.runPromise(
        dynamodb.scan({ TableName: TEST_TABLE_NAME }),
      );

      if (scanResult.Items && scanResult.Items.length > 0) {
        const deleteRequests = scanResult.Items.map((item) => ({
          DeleteRequest: {
            Key: {
              userId: item.userId,
            },
          },
        }));

        // Delete in batches of 25 (DynamoDB limit)
        for (let i = 0; i < deleteRequests.length; i += 25) {
          const batch = deleteRequests.slice(i, i + 25);
          await Effect.runPromise(
            dynamodb.batchWriteItem({
              RequestItems: {
                [TEST_TABLE_NAME]: batch,
              },
            }),
          );
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    // Clean up test table
    try {
      await Effect.runPromise(
        dynamodb.deleteTable({ TableName: TEST_TABLE_NAME }),
      );
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("basic item operations", () => {
    const testUser: TestUser = {
      userId: "user-123",
      email: "test@example.com",
      name: "Test User",
      age: 30,
      tags: ["developer", "tester"],
    };

    it("should put an item", async () => {
      const result = await Effect.runPromise(
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: testUser.userId },
            email: { S: testUser.email },
            name: { S: testUser.name },
            age: { N: testUser.age!.toString() },
            tags: { SS: testUser.tags! },
          },
        }),
      );

      expect(result).toBeDefined();
    });

    it("should get an item", async () => {
      // First put the item
      await Effect.runPromise(
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: testUser.userId },
            email: { S: testUser.email },
            name: { S: testUser.name },
          },
        }),
      );

      // Then get it
      const result = await Effect.runPromise(
        dynamodb.getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: testUser.userId },
          },
        }),
      );

      expect(result.Item).toBeDefined();
      expect(result.Item!.userId.S).toBe(testUser.userId);
      expect(result.Item!.email.S).toBe(testUser.email);
      expect(result.Item!.name.S).toBe(testUser.name);
    });

    it("should update an item", async () => {
      // First put the item
      await Effect.runPromise(
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: testUser.userId },
            email: { S: testUser.email },
            name: { S: testUser.name },
            age: { N: "25" },
          },
        }),
      );

      // Update it
      const result = await Effect.runPromise(
        dynamodb.updateItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: testUser.userId },
          },
          UpdateExpression: "SET age = :age, #n = :name",
          ExpressionAttributeValues: {
            ":age": { N: "30" },
            ":name": { S: "Updated Name" },
          },
          ExpressionAttributeNames: {
            "#n": "name",
          },
          ReturnValues: "ALL_NEW",
        }),
      );

      expect(result.Attributes).toBeDefined();
      expect(result.Attributes!.age.N).toBe("30");
      expect(result.Attributes!.name.S).toBe("Updated Name");
    });

    it("should delete an item", async () => {
      // First put the item
      await Effect.runPromise(
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: testUser.userId },
            email: { S: testUser.email },
            name: { S: testUser.name },
          },
        }),
      );

      // Delete it
      const deleteResult = await Effect.runPromise(
        dynamodb.deleteItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: testUser.userId },
          },
          ReturnValues: "ALL_OLD",
        }),
      );

      expect(deleteResult.Attributes).toBeDefined();
      expect(deleteResult.Attributes!.userId.S).toBe(testUser.userId);

      // Verify it's gone
      const getResult = await Effect.runPromise(
        dynamodb.getItem({
          TableName: TEST_TABLE_NAME,
          Key: {
            userId: { S: testUser.userId },
          },
        }),
      );

      expect(getResult.Item).toBeUndefined();
    });
  });

  describe("batch operations", () => {
    it("should batch write items", async () => {
      const result = await Effect.runPromise(
        dynamodb.batchWriteItem({
          RequestItems: {
            [TEST_TABLE_NAME]: [
              {
                PutRequest: {
                  Item: {
                    userId: { S: "batch-1" },
                    email: { S: "batch1@example.com" },
                    name: { S: "Batch User 1" },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: "batch-2" },
                    email: { S: "batch2@example.com" },
                    name: { S: "Batch User 2" },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: "batch-3" },
                    email: { S: "batch3@example.com" },
                    name: { S: "Batch User 3" },
                  },
                },
              },
            ],
          },
        }),
      );

      expect(result).toBeDefined();
      expect(result.UnprocessedItems).toEqual({});
    });

    it("should batch get items", async () => {
      // First put some items
      await Effect.runPromise(
        dynamodb.batchWriteItem({
          RequestItems: {
            [TEST_TABLE_NAME]: [
              {
                PutRequest: {
                  Item: {
                    userId: { S: "batch-get-1" },
                    email: { S: "batchget1@example.com" },
                    name: { S: "Batch Get User 1" },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: "batch-get-2" },
                    email: { S: "batchget2@example.com" },
                    name: { S: "Batch Get User 2" },
                  },
                },
              },
            ],
          },
        }),
      );

      // Then batch get them
      const result = await Effect.runPromise(
        dynamodb.batchGetItem({
          RequestItems: {
            [TEST_TABLE_NAME]: {
              Keys: [
                { userId: { S: "batch-get-1" } },
                { userId: { S: "batch-get-2" } },
                { userId: { S: "nonexistent" } },
              ],
            },
          },
        }),
      );

      expect(result.Responses).toBeDefined();
      expect(result.Responses![TEST_TABLE_NAME]).toHaveLength(2);

      const items = result.Responses![TEST_TABLE_NAME];
      const userIds = items.map((item) => item.userId.S).sort();
      expect(userIds).toEqual(["batch-get-1", "batch-get-2"]);
    });
  });

  describe("query operations", () => {
    beforeEach(async () => {
      // Set up test data for queries
      await Effect.runPromise(
        dynamodb.batchWriteItem({
          RequestItems: {
            [TEST_TABLE_NAME]: [
              {
                PutRequest: {
                  Item: {
                    userId: { S: "query-user-1" },
                    email: { S: "query1@example.com" },
                    name: { S: "Query User 1" },
                    age: { N: "25" },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: "query-user-2" },
                    email: { S: "query2@example.com" },
                    name: { S: "Query User 2" },
                    age: { N: "30" },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: "query-user-3" },
                    email: { S: "query3@example.com" },
                    name: { S: "Query User 3" },
                    age: { N: "35" },
                  },
                },
              },
            ],
          },
        }),
      );

      // Wait a bit for GSI to be updated
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    it("should query by primary key", async () => {
      const result = await Effect.runPromise(
        dynamodb.query({
          TableName: TEST_TABLE_NAME,
          KeyConditionExpression: "userId = :userId",
          ExpressionAttributeValues: {
            ":userId": { S: "query-user-1" },
          },
        }),
      );

      expect(result.Items).toBeDefined();
      expect(result.Items).toHaveLength(1);
      expect(result.Items![0].userId.S).toBe("query-user-1");
    });

    it("should query with GSI", async () => {
      const result = await Effect.runPromise(
        dynamodb.query({
          TableName: TEST_TABLE_NAME,
          IndexName: "EmailIndex",
          KeyConditionExpression: "email = :email",
          ExpressionAttributeValues: {
            ":email": { S: "query2@example.com" },
          },
        }),
      );

      expect(result.Items).toBeDefined();
      expect(result.Items).toHaveLength(1);
      expect(result.Items![0].email.S).toBe("query2@example.com");
    });

    it("should query with filter expression", async () => {
      const result = await Effect.runPromise(
        dynamodb.query({
          TableName: TEST_TABLE_NAME,
          KeyConditionExpression: "userId = :userId",
          FilterExpression: "age > :minAge",
          ExpressionAttributeValues: {
            ":userId": { S: "query-user-2" },
            ":minAge": { N: "20" },
          },
        }),
      );

      expect(result.Items).toBeDefined();
      expect(result.Items).toHaveLength(1);
      expect(result.Items![0].userId.S).toBe("query-user-2");
    });
  });

  describe("scan operations", () => {
    beforeEach(async () => {
      // Set up test data for scans
      await Effect.runPromise(
        dynamodb.batchWriteItem({
          RequestItems: {
            [TEST_TABLE_NAME]: [
              {
                PutRequest: {
                  Item: {
                    userId: { S: "scan-user-1" },
                    email: { S: "scan1@example.com" },
                    name: { S: "Scan User 1" },
                    age: { N: "25" },
                    active: { BOOL: true },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: "scan-user-2" },
                    email: { S: "scan2@example.com" },
                    name: { S: "Scan User 2" },
                    age: { N: "30" },
                    active: { BOOL: false },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    userId: { S: "scan-user-3" },
                    email: { S: "scan3@example.com" },
                    name: { S: "Scan User 3" },
                    age: { N: "35" },
                    active: { BOOL: true },
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it("should scan all items", async () => {
      const result = await Effect.runPromise(
        dynamodb.scan({
          TableName: TEST_TABLE_NAME,
        }),
      );

      expect(result.Items).toBeDefined();
      expect(result.Items!.length).toBeGreaterThanOrEqual(3);
    });

    it("should scan with filter expression", async () => {
      const result = await Effect.runPromise(
        dynamodb.scan({
          TableName: TEST_TABLE_NAME,
          FilterExpression: "active = :active",
          ExpressionAttributeValues: {
            ":active": { BOOL: true },
          },
        }),
      );

      expect(result.Items).toBeDefined();
      expect(result.Items!.length).toBeGreaterThanOrEqual(2);

      // All returned items should have active = true
      result.Items!.forEach((item) => {
        expect(item.active?.BOOL).toBe(true);
      });
    });

    it("should scan with limit", async () => {
      const result = await Effect.runPromise(
        dynamodb.scan({
          TableName: TEST_TABLE_NAME,
          Limit: 2,
        }),
      );

      expect(result.Items).toBeDefined();
      expect(result.Items!.length).toBeLessThanOrEqual(2);
    });

    it("should scan with pagination", async () => {
      // First scan with limit
      const firstResult = await Effect.runPromise(
        dynamodb.scan({
          TableName: TEST_TABLE_NAME,
          Limit: 1,
        }),
      );

      expect(firstResult.Items).toBeDefined();
      expect(firstResult.Items!.length).toBe(1);

      // If there's more data, test pagination
      if (firstResult.LastEvaluatedKey) {
        const secondResult = await Effect.runPromise(
          dynamodb.scan({
            TableName: TEST_TABLE_NAME,
            Limit: 1,
            ExclusiveStartKey: firstResult.LastEvaluatedKey,
          }),
        );

        expect(secondResult.Items).toBeDefined();
        expect(secondResult.Items!.length).toBe(1);

        // Should be different items
        expect(secondResult.Items![0].userId.S).not.toBe(
          firstResult.Items![0].userId.S,
        );
      }
    });
  });

  describe("error Handling", () => {
    it("should handle table not found error", async () => {
      const result = Effect.runPromise(
        dynamodb.getItem({
          TableName: "nonexistent-table",
          Key: {
            userId: { S: "test" },
          },
        }),
      );

      await expect(result).rejects.toThrow();
    });

    it("should handle validation errors", async () => {
      const result = Effect.runPromise(
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            // Missing required key attribute
            email: { S: "test@example.com" },
          },
        }),
      );

      await expect(result).rejects.toThrow();
    });

    it("should handle conditional check failures", async () => {
      // Put an item first
      await Effect.runPromise(
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: "conditional-test" },
            email: { S: "conditional@example.com" },
            name: { S: "Conditional Test" },
          },
        }),
      );

      // Try to put with condition that should fail
      const result = Effect.runPromise(
        dynamodb.putItem({
          TableName: TEST_TABLE_NAME,
          Item: {
            userId: { S: "conditional-test" },
            email: { S: "new@example.com" },
            name: { S: "New Name" },
          },
          ConditionExpression: "attribute_not_exists(userId)",
        }),
      );

      await expect(result).rejects.toThrow();
    });
  });

  describe("table Operations", () => {
    it("should list tables", async () => {
      const result = await Effect.runPromise(
        dynamodb.listTables({
          Limit: 10,
        }),
      );

      expect(result.TableNames).toBeDefined();
      expect(result.TableNames).toContain(TEST_TABLE_NAME);
    });

    it("should describe table", async () => {
      const result = await Effect.runPromise(
        dynamodb.describeTable({
          TableName: TEST_TABLE_NAME,
        }),
      );

      expect(result.Table).toBeDefined();
      expect(result.Table!.TableName).toBe(TEST_TABLE_NAME);
      expect(result.Table!.TableStatus).toBe("ACTIVE");
    });
  });
});

