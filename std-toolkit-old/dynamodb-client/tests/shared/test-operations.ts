/**
 * Shared test operation definitions that can be used with both clients
 */

import type { TestItem } from "./test-data.js";

// Common test operation interfaces
export interface TestOperation {
  name: string;
  description: string;
}

export interface PutItemTest extends TestOperation {
  type: "put";
  item: TestItem;
}

export interface GetItemTest extends TestOperation {
  type: "get";
  key: { pk: string; sk: string };
}

export interface UpdateItemTest extends TestOperation {
  type: "update";
  key: { pk: string; sk: string };
  updateExpression: string;
  expressionAttributeValues: Record<string, any>;
  expressionAttributeNames?: Record<string, string>;
}

export interface DeleteItemTest extends TestOperation {
  type: "delete"; 
  key: { pk: string; sk: string };
}

export interface QueryTest extends TestOperation {
  type: "query";
  keyConditionExpression: string;
  expressionAttributeValues: Record<string, any>;
  expressionAttributeNames?: Record<string, string>;
  indexName?: string;
  filterExpression?: string;
  limit?: number;
}

export interface ScanTest extends TestOperation {
  type: "scan";
  filterExpression?: string;
  expressionAttributeValues?: Record<string, any>;
  expressionAttributeNames?: Record<string, string>;
  limit?: number;
}

export interface BatchWriteTest extends TestOperation {
  type: "batchWrite";
  items: TestItem[];
}

export interface BatchGetTest extends TestOperation {
  type: "batchGet";
  keys: { pk: string; sk: string }[];
}

export type TestOperationDefinition = 
  | PutItemTest 
  | GetItemTest 
  | UpdateItemTest 
  | DeleteItemTest 
  | QueryTest 
  | ScanTest
  | BatchWriteTest
  | BatchGetTest;

// Predefined test operations
export const testOperations: TestOperationDefinition[] = [
  {
    type: "put",
    name: "Put Item",
    description: "Put a single item into the table",
    item: {
      pk: "TEST#1",
      sk: "DATA", 
      name: "Test User",
      age: 30,
      email: "test@example.com",
      status: "active"
    }
  },
  {
    type: "get", 
    name: "Get Item",
    description: "Get a single item by primary key",
    key: { pk: "TEST#1", sk: "DATA" }
  },
  {
    type: "update",
    name: "Update Item", 
    description: "Update item attributes",
    key: { pk: "TEST#1", sk: "DATA" },
    updateExpression: "SET #name = :name, age = :age",
    expressionAttributeNames: { "#name": "name" },
    expressionAttributeValues: { ":name": "Updated User", ":age": 31 }
  },
  {
    type: "query",
    name: "Query by PK", 
    description: "Query items by partition key",
    keyConditionExpression: "pk = :pk",
    expressionAttributeValues: { ":pk": "USER#1" }
  },
  {
    type: "query",
    name: "Query GSI",
    description: "Query using Global Secondary Index", 
    indexName: "GSI1",
    keyConditionExpression: "gsi1pk = :gsi1pk",
    expressionAttributeValues: { ":gsi1pk": "STATUS#active" },
    limit: 10
  },
  {
    type: "scan", 
    name: "Scan Table",
    description: "Scan all items in table",
    limit: 10
  },
  {
    type: "scan",
    name: "Scan with Filter",
    description: "Scan with filter expression",
    filterExpression: "#status = :status",
    expressionAttributeNames: { "#status": "status" },
    expressionAttributeValues: { ":status": "active" },
    limit: 10
  },
  {
    type: "delete",
    name: "Delete Item",
    description: "Delete a single item",
    key: { pk: "TEST#1", sk: "DATA" }
  }
];