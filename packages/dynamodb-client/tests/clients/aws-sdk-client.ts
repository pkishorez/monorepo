/**
 * AWS SDK DynamoDB client wrapper for performance testing
 */

import type { TestItem } from "../shared/test-data.js";
import {
  BatchGetItemCommand as BatchGetItem,
  BatchWriteItemCommand as BatchWriteItem,
  CreateTableCommand,
  DeleteItemCommand as DeleteItem,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  GetItemCommand as GetItem,
  ListTablesCommand,
  PutItemCommand as PutItem,
  QueryCommand as Query,
  ScanCommand as Scan,
  UpdateItemCommand as UpdateItem,
} from "@aws-sdk/client-dynamodb";

export class AWSSDKClient {
  private client: DynamoDBClient;

  constructor(config: {
    region: string;
    endpoint?: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    };
  }) {
    this.client = new DynamoDBClient(config);
  }

  // Helper to convert TestItem to DynamoDB format
  private itemToDynamoDB(item: TestItem): Record<string, any> {
    const result: Record<string, any> = {};
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

  // Helper to convert DynamoDB format to TestItem
  private itemFromDynamoDB(item: Record<string, any>): TestItem | null {
    if (!item) return null;
    
    const result: any = {};
    for (const [key, value] of Object.entries(item)) {
      if (value.S !== undefined) {
        result[key] = value.S;
      } else if (value.N !== undefined) {
        result[key] = Number.parseInt(value.N);
      } else if (value.BOOL !== undefined) {
        result[key] = value.BOOL;
      }
    }
    return result as TestItem;
  }

  // Helper to convert key to DynamoDB format
  private keyToDynamoDB(key: { pk: string; sk: string }): Record<string, any> {
    return {
      pk: { S: key.pk },
      sk: { S: key.sk }
    };
  }

  // Helper to convert expression attribute values
  private attributeValuesToDynamoDB(values?: Record<string, any>): Record<string, any> | undefined {
    if (!values) return undefined;
    
    const result: Record<string, any> = {};
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
    const command = new PutItem({
      TableName: tableName,
      Item: this.itemToDynamoDB(item)
    });
    await this.client.send(command);
  }

  async getItem(tableName: string, key: { pk: string; sk: string }): Promise<TestItem | null> {
    const command = new GetItem({
      TableName: tableName,
      Key: this.keyToDynamoDB(key)
    });
    const result = await this.client.send(command);
    return this.itemFromDynamoDB(result.Item || {});
  }

  async updateItem(
    tableName: string,
    key: { pk: string; sk: string },
    updateExpression: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<void> {
    const command = new UpdateItem({
      TableName: tableName,
      Key: this.keyToDynamoDB(key),
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: this.attributeValuesToDynamoDB(expressionAttributeValues),
      ExpressionAttributeNames: expressionAttributeNames
    });
    await this.client.send(command);
  }

  async deleteItem(tableName: string, key: { pk: string; sk: string }): Promise<void> {
    const command = new DeleteItem({
      TableName: tableName,
      Key: this.keyToDynamoDB(key)
    });
    await this.client.send(command);
  }

  async query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
    indexName?: string,
    filterExpression?: string,
    limit?: number
  ): Promise<{ Items: TestItem[]; Count: number; ScannedCount: number }> {
    const command = new Query({
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: this.attributeValuesToDynamoDB(expressionAttributeValues),
      ExpressionAttributeNames: expressionAttributeNames,
      IndexName: indexName,
      FilterExpression: filterExpression,
      Limit: limit
    });
    
    const result = await this.client.send(command);
    const items = (result.Items || []).map(item => this.itemFromDynamoDB(item)).filter(Boolean) as TestItem[];
    
    return {
      Items: items,
      Count: result.Count || 0,
      ScannedCount: result.ScannedCount || 0
    };
  }

  async scan(
    tableName: string,
    filterExpression?: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
    limit?: number
  ): Promise<{ Items: TestItem[]; Count: number; ScannedCount: number }> {
    const command = new Scan({
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: this.attributeValuesToDynamoDB(expressionAttributeValues),
      ExpressionAttributeNames: expressionAttributeNames,
      Limit: limit
    });
    
    const result = await this.client.send(command);
    const items = (result.Items || []).map(item => this.itemFromDynamoDB(item)).filter(Boolean) as TestItem[];
    
    return {
      Items: items,
      Count: result.Count || 0,
      ScannedCount: result.ScannedCount || 0
    };
  }

  async batchWriteItem(tableName: string, items: TestItem[]): Promise<void> {
    const putRequests = items.map(item => ({
      PutRequest: {
        Item: this.itemToDynamoDB(item)
      }
    }));

    const command = new BatchWriteItem({
      RequestItems: {
        [tableName]: putRequests
      }
    });
    
    await this.client.send(command);
  }

  async batchGetItem(tableName: string, keys: { pk: string; sk: string }[]): Promise<TestItem[]> {
    const command = new BatchGetItem({
      RequestItems: {
        [tableName]: {
          Keys: keys.map(key => this.keyToDynamoDB(key))
        }
      }
    });
    
    const result = await this.client.send(command);
    const items = result.Responses?.[tableName] || [];
    return items.map(item => this.itemFromDynamoDB(item)).filter(Boolean) as TestItem[];
  }

  async createTable(tableDefinition: any): Promise<void> {
    const command = new CreateTableCommand(tableDefinition);
    await this.client.send(command);
  }

  async deleteTable(tableName: string): Promise<void> {
    const command = new DeleteTableCommand({ TableName: tableName });
    await this.client.send(command);
  }

  async describeTable(tableName: string): Promise<any> {
    const command = new DescribeTableCommand({ TableName: tableName });
    return await this.client.send(command);
  }

  async listTables(): Promise<{ TableNames: string[] }> {
    const command = new ListTablesCommand({});
    const result = await this.client.send(command);
    return { TableNames: result.TableNames || [] };
  }

  async waitForTableReady(tableName: string, maxWait: number = 30000): Promise<void> {
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
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Table ${tableName} did not become ready within ${maxWait}ms`);
  }
}