/**
 * Shared test data and utilities for both Effect DynamoDB client and AWS SDK client
 */

export const TEST_TABLE_NAME = "TestTable";
export const TEST_GSI_NAME = "GSI1";

export interface TestItem {
  pk: string;
  sk: string;
  name: string;
  age: number;
  email: string;
  status: string;
  gsi1pk?: string;
  gsi1sk?: string;
}

// Sample test items
export const testItems: TestItem[] = [
  {
    pk: "USER#1",
    sk: "PROFILE",
    name: "John Doe",
    age: 30,
    email: "john@example.com",
    status: "active",
    gsi1pk: "STATUS#active",
    gsi1sk: "USER#1",
  },
  {
    pk: "USER#2", 
    sk: "PROFILE",
    name: "Jane Smith",
    age: 25,
    email: "jane@example.com", 
    status: "active",
    gsi1pk: "STATUS#active",
    gsi1sk: "USER#2",
  },
  {
    pk: "USER#3",
    sk: "PROFILE", 
    name: "Bob Johnson",
    age: 35,
    email: "bob@example.com",
    status: "inactive",
    gsi1pk: "STATUS#inactive",
    gsi1sk: "USER#3",
  },
  {
    pk: "USER#4",
    sk: "PROFILE",
    name: "Alice Brown", 
    age: 28,
    email: "alice@example.com",
    status: "active",
    gsi1pk: "STATUS#active", 
    gsi1sk: "USER#4",
  },
  {
    pk: "USER#5",
    sk: "PROFILE",
    name: "Charlie Wilson",
    age: 40,
    email: "charlie@example.com",
    status: "pending",
    gsi1pk: "STATUS#pending",
    gsi1sk: "USER#5",
  }
];

// Table schema for testing
export const tableSchema = {
  TableName: TEST_TABLE_NAME,
  KeySchema: [
    { AttributeName: "pk", KeyType: "HASH" },
    { AttributeName: "sk", KeyType: "RANGE" }
  ],
  AttributeDefinitions: [
    { AttributeName: "pk", AttributeType: "S" },
    { AttributeName: "sk", AttributeType: "S" },
    { AttributeName: "gsi1pk", AttributeType: "S" },
    { AttributeName: "gsi1sk", AttributeType: "S" }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: TEST_GSI_NAME,
      KeySchema: [
        { AttributeName: "gsi1pk", KeyType: "HASH" },
        { AttributeName: "gsi1sk", KeyType: "RANGE" }
      ],
      Projection: { ProjectionType: "ALL" },
      BillingMode: "PAY_PER_REQUEST"
    }
  ],
  BillingMode: "PAY_PER_REQUEST"
};

// Performance test configurations
export const PERFORMANCE_TEST_SIZES = [10, 50, 100] as const;
export const PERFORMANCE_ITERATIONS = 3;

// Generate test data for performance tests
export function generateTestItems(count: number): TestItem[] {
  return Array.from({ length: count }, (_, i) => ({
    pk: `PERF#${i}`,
    sk: "DATA",
    name: `User ${i}`,
    age: 20 + (i % 50),
    email: `user${i}@example.com`,
    status: i % 3 === 0 ? "active" : i % 3 === 1 ? "inactive" : "pending",
    gsi1pk: `STATUS#${i % 3 === 0 ? "active" : i % 3 === 1 ? "inactive" : "pending"}`,
    gsi1sk: `PERF#${i}`,
  }));
}