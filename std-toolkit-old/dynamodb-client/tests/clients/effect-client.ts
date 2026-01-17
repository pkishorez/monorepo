/**
 * Effect DynamoDB client wrapper for performance testing
 */

import type { AttributeValue, DynamoDB } from "../../src/index.js";
import type { TestItem } from "../shared/test-data.js";
import { Effect } from "effect";
import { createDynamoDB } from "../../src/index.js";

export class EffectClient {
  private client: DynamoDB;

  constructor(config: {
    region: string;
    endpoint?: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    };
  }) {
    this.client = createDynamoDB(config);
  }

  // Helper to convert TestItem to DynamoDB AttributeValue format
  private itemToDynamoDB(item: TestItem): Record<string, AttributeValue> {
    const result: Record<string, AttributeValue> = {};
    for (const [key, value] of Object.entries(item)) {
      if (value !== undefined) {
        if (typeof value === "string") {
          result[key] = { S: value };
        } else if (typeof value === "number") {
          result[key] = { N: value.toString() };
        } else if (typeof value === "boolean") {
          result[key] = { BOOL: value };
        }
      }
    }
    return result;
  }

  // Helper to convert DynamoDB AttributeValue format to TestItem
  private itemFromDynamoDB(item: Record<string, AttributeValue> | null): TestItem | null {
    if (!item) return null;
    
    const result: any = {};
    for (const [key, value] of Object.entries(item)) {
      if ("S" in value && value.S !== undefined) {
        result[key] = value.S;
      } else if ("N" in value && value.N !== undefined) {
        result[key] = Number.parseInt(value.N);
      } else if ("BOOL" in value && value.BOOL !== undefined) {
        result[key] = value.BOOL;
      }
    }
    return result as TestItem;
  }

  // Helper to convert key to DynamoDB AttributeValue format
  private keyToDynamoDB(key: { pk: string; sk: string }): Record<string, AttributeValue> {
    return {
      pk: { S: key.pk },
      sk: { S: key.sk }
    };
  }

  // Helper to convert expression attribute values
  private attributeValuesToDynamoDB(values?: Record<string, any>): Record<string, AttributeValue> | undefined {
    if (!values) return undefined;
    
    const result: Record<string, AttributeValue> = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string") {
        result[key] = { S: value };
      } else if (typeof value === "number") {
        result[key] = { N: value.toString() };
      } else if (typeof value === "boolean") {
        result[key] = { BOOL: value };
      }
    }
    return result;
  }

  async putItem(tableName: string, item: TestItem): Promise<void> {
    const program = this.client.putItem({
      TableName: tableName,
      Item: this.itemToDynamoDB(item),
    });
    await Effect.runPromise(program);
  }

  async getItem(
    tableName: string,
    key: { pk: string; sk: string },
  ): Promise<TestItem | null> {
    const program = this.client.getItem({
      TableName: tableName,
      Key: this.keyToDynamoDB(key),
    });
    const result = await Effect.runPromise(program);
    return this.itemFromDynamoDB(result.Item || null);
  }

  async updateItem(
    tableName: string,
    key: { pk: string; sk: string },
    updateExpression: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
  ): Promise<void> {
    const updateInput: any = {
      TableName: tableName,
      Key: this.keyToDynamoDB(key),
      UpdateExpression: updateExpression,
    };

    if (expressionAttributeValues) {
      updateInput.ExpressionAttributeValues = this.attributeValuesToDynamoDB(expressionAttributeValues);
    }
    if (expressionAttributeNames) {
      updateInput.ExpressionAttributeNames = expressionAttributeNames;
    }

    const program = this.client.updateItem(updateInput);
    await Effect.runPromise(program);
  }

  async deleteItem(
    tableName: string,
    key: { pk: string; sk: string },
  ): Promise<void> {
    const program = this.client.deleteItem({
      TableName: tableName,
      Key: this.keyToDynamoDB(key),
    });
    await Effect.runPromise(program);
  }

  async query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
    indexName?: string,
    filterExpression?: string,
    limit?: number,
  ): Promise<{ Items: TestItem[]; Count: number; ScannedCount: number }> {
    const queryInput: any = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
    };

    if (expressionAttributeValues) {
      queryInput.ExpressionAttributeValues = this.attributeValuesToDynamoDB(expressionAttributeValues);
    }
    if (expressionAttributeNames) {
      queryInput.ExpressionAttributeNames = expressionAttributeNames;
    }
    if (indexName) {
      queryInput.IndexName = indexName;
    }
    if (filterExpression) {
      queryInput.FilterExpression = filterExpression;
    }
    if (limit) {
      queryInput.Limit = limit;
    }

    const program = this.client.query(queryInput);

    const result = await Effect.runPromise(program);
    const items = (result.Items || []).map(item => this.itemFromDynamoDB(item)).filter(Boolean) as TestItem[];
    
    return {
      Items: items,
      Count: result.Count || 0,
      ScannedCount: result.ScannedCount || 0,
    };
  }

  async scan(
    tableName: string,
    filterExpression?: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
    limit?: number,
  ): Promise<{ Items: TestItem[]; Count: number; ScannedCount: number }> {
    const scanInput: any = {
      TableName: tableName,
    };

    if (expressionAttributeValues) {
      scanInput.ExpressionAttributeValues = this.attributeValuesToDynamoDB(expressionAttributeValues);
    }
    if (expressionAttributeNames) {
      scanInput.ExpressionAttributeNames = expressionAttributeNames;
    }
    if (filterExpression) {
      scanInput.FilterExpression = filterExpression;
    }
    if (limit) {
      scanInput.Limit = limit;
    }

    const program = this.client.scan(scanInput);

    const result = await Effect.runPromise(program);
    const items = (result.Items || []).map(item => this.itemFromDynamoDB(item)).filter(Boolean) as TestItem[];
    
    return {
      Items: items,
      Count: result.Count || 0,
      ScannedCount: result.ScannedCount || 0,
    };
  }

  async batchWriteItem(tableName: string, items: TestItem[]): Promise<void> {
    const putRequests = items.map((item) => ({
      PutRequest: {
        Item: this.itemToDynamoDB(item),
      },
    }));

    const program = this.client.batchWriteItem({
      RequestItems: {
        [tableName]: putRequests,
      },
    });

    await Effect.runPromise(program);
  }

  async batchGetItem(
    tableName: string,
    keys: { pk: string; sk: string }[],
  ): Promise<TestItem[]> {
    const program = this.client.batchGetItem({
      RequestItems: {
        [tableName]: {
          Keys: keys.map(key => this.keyToDynamoDB(key)),
        },
      },
    });

    const result = await Effect.runPromise(program);
    const items = result.Responses?.[tableName] || [];
    return items.map(item => this.itemFromDynamoDB(item)).filter(Boolean) as TestItem[];
  }

  async createTable(tableDefinition: any): Promise<void> {
    const program = this.client.createTable(tableDefinition);
    await Effect.runPromise(program);
  }

  async deleteTable(tableName: string): Promise<void> {
    const program = this.client.deleteTable({ TableName: tableName });
    await Effect.runPromise(program);
  }

  async describeTable(tableName: string): Promise<any> {
    const program = this.client.describeTable({ TableName: tableName });
    return await Effect.runPromise(program);
  }

  async listTables(): Promise<{ TableNames: string[] }> {
    const program = this.client.listTables({});
    const result = await Effect.runPromise(program);
    return { TableNames: result.TableNames || [] };
  }

  async waitForTableReady(
    tableName: string,
    maxWait: number = 30000,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        const result = await this.describeTable(tableName);
        if (result.Table?.TableStatus === "ACTIVE") {
          return;
        }
      } catch {
        // Table might not exist yet
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(
      `Table ${tableName} did not become ready within ${maxWait}ms`,
    );
  }
}

