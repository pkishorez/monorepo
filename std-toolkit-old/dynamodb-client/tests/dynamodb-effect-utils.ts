import type { DynamoDB } from "../src/index.js";
import { Effect } from "effect";
import { retryUntil, sleep } from "./effect-test-utils.js";

// Test configuration for local DynamoDB
export const TEST_CONFIG = {
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
} as const;

// Test table name
export const TEST_TABLE_NAME = "test-dynamodb-client";

// Test data types
export interface TestUser {
  userId: string;
  email: string;
  name: string;
  age?: number;
  tags?: string[];
}

/**
 * Create a test table with Effect.TS
 */
export function createTestTable (dynamodb: DynamoDB) {
  return Effect.gen(function* () {
    try {
      yield* dynamodb.createTable({
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
      });
    } catch (error) {
      // Table might already exist, which is fine for testing
      if (
        !(error instanceof Error) ||
        !error.message.includes("already exists")
      ) {
        yield* Effect.logWarning("Failed to create test table", { error });
      }
    }
  })
}

/**
 * Wait for table to become active
 */
export function waitForTableActive (dynamodb: DynamoDB) {
  return retryUntil(
    dynamodb.describeTable({ TableName: TEST_TABLE_NAME }),
    (response: any) => response.Table?.TableStatus === "ACTIVE",
    30,
    1000,
  ).pipe(
    Effect.flatMap((response: any) => {
      if (response.Table?.TableStatus !== "ACTIVE") {
        return Effect.fail("Test table failed to become active");
      }
      return Effect.succeed(response);
    }),
  )
}

/**
 * Clean up all test data from the table
 */
export function cleanupTestData (dynamodb: DynamoDB) {
  return Effect.gen(function* () {
    try {
      const scanResult = yield* dynamodb.scan({ TableName: TEST_TABLE_NAME });

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
          yield* dynamodb.batchWriteItem({
            RequestItems: {
              [TEST_TABLE_NAME]: batch,
            },
          });
        }
      }
    } catch (error) {
      // Ignore cleanup errors
      yield* Effect.logDebug("Cleanup error (ignored)", { error });
    }
  })
}

/**
 * Delete test table
 */
export function deleteTestTable (dynamodb: DynamoDB) {
  return Effect.gen(function* () {
    try {
      yield* dynamodb.deleteTable({ TableName: TEST_TABLE_NAME });
    } catch (error) {
      // Ignore cleanup errors
      yield* Effect.logDebug("Delete table error (ignored)", { error });
    }
  })
}

/**
 * Setup test environment (create table and wait for it to be active)
 */
export function setupTestEnvironment (dynamodb: DynamoDB) {
  return Effect.gen(function* () {
    yield* createTestTable(dynamodb);
    yield* waitForTableActive(dynamodb);
  })
}

/**
 * Put test user data as an Effect
 */
export function putTestUser (dynamodb: DynamoDB, user: TestUser) {
  return dynamodb.putItem({
    TableName: TEST_TABLE_NAME,
    Item: {
      userId: { S: user.userId },
      email: { S: user.email },
      name: { S: user.name },
      ...(user.age ? { age: { N: user.age.toString() } } : {}),
      ...(user.tags ? { tags: { SS: user.tags } } : {}),
    },
  })
}

/**
 * Get test user data as an Effect
 */
export function getTestUser (dynamodb: DynamoDB, userId: string) {
  return dynamodb.getItem({
    TableName: TEST_TABLE_NAME,
    Key: {
      userId: { S: userId },
    },
  })
}

/**
 * Seed test data for query operations
 */
export function seedQueryTestData (dynamodb: DynamoDB) {
  return dynamodb.batchWriteItem({
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
  }).pipe(
    Effect.andThen(sleep(1000)), // Wait for GSI to be updated
  )
}

/**
 * Seed test data for scan operations
 */
export function seedScanTestData (dynamodb: DynamoDB) {
  return dynamodb.batchWriteItem({
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
  })
}