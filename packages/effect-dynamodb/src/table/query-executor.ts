import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { KeyConditionExpr } from "./expr/index.js";
import type {
  EnhancedQueryResult,
  EnhancedScanResult,
  IndexDefinition,
  ItemWithKeys,
  KeyConditionExprParameters,
  KeyConditionExprSK,
  QueryOptions,
  ScanOptions,
} from "./types.js";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Effect } from "effect";
import { keyCondition } from "./expr/index.js";

export class DynamoQueryExecutor {
  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string,
  ) {}

  executeQuery<TIndex extends IndexDefinition>(
    key: KeyConditionExprParameters<TIndex>,
    index: TIndex,
    options?: QueryOptions & { indexName?: string },
  ): Effect.Effect<EnhancedQueryResult<any>> {
    const keyExpressions = this.buildKeyExpressions(key, index, options);

    return Effect.promise(() =>
      this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: options?.indexName,
          ...keyExpressions,
          Limit: options?.limit,
          ScanIndexForward: options?.scanIndexForward,
          ExclusiveStartKey: options?.exclusiveStartKey,
          ConsistentRead: options?.consistentRead,
          FilterExpression: options?.filterExpression,
          ProjectionExpression: options?.projectionExpression,
          Select: options?.select,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
        }),
      ),
    ).pipe(
      Effect.map((response) => ({
        Items: (response.Items as ItemWithKeys<TIndex>[]) || [],
        Count: response.Count,
        ScannedCount: response.ScannedCount,
        LastEvaluatedKey: response.LastEvaluatedKey,
        ConsumedCapacity: response.ConsumedCapacity,
      })),
    );
  }

  executeScan(
    options?: ScanOptions & { indexName?: string },
  ): Effect.Effect<EnhancedScanResult<any>> {
    return Effect.promise(() =>
      this.client.send(
        new ScanCommand({
          TableName: this.tableName,
          IndexName: options?.indexName,
          Limit: options?.limit,
          ExclusiveStartKey: options?.exclusiveStartKey,
          ConsistentRead: options?.consistentRead,
          FilterExpression: options?.filterExpression,
          ProjectionExpression: options?.projectionExpression,
          ExpressionAttributeNames: options?.expressionAttributeNames,
          ExpressionAttributeValues: options?.expressionAttributeValues,
          Select: options?.select,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
          Segment: options?.segment,
          TotalSegments: options?.totalSegments,
        }),
      ),
    ).pipe(
      Effect.map((response) => ({
        Items: response.Items || [],
        Count: response.Count,
        ScannedCount: response.ScannedCount,
        LastEvaluatedKey: response.LastEvaluatedKey,
        ConsumedCapacity: response.ConsumedCapacity,
      })),
    );
  }

  private buildKeyExpressions<TIndex extends IndexDefinition>(
    key: KeyConditionExprParameters<TIndex>,
    index: TIndex,
    options?: QueryOptions,
  ) {
    // Convert from old format to new unified format
    const unifiedKey = this.convertKeyConditionFormat(key, index);

    // Generate key condition expression using our unified function
    const keyExprResult = keyCondition(index, unifiedKey);

    // Merge with any existing expression attributes/values from options
    const expressionAttributeNames: Record<string, string> = {
      ...(options?.expressionAttributeNames || {}),
      ...keyExprResult.exprAttributes,
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ...(options?.expressionAttributeValues || {}),
      ...keyExprResult.exprValues,
    };

    return {
      KeyConditionExpression: keyExprResult.condition,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };
  }

  private convertKeyConditionFormat<TIndex extends IndexDefinition>(
    key: KeyConditionExprParameters<TIndex>,
    index: TIndex,
  ): import("./expr/index.js").KeyConditionExprParameters<TIndex> {
    const result: any = { pk: key.pk };

    // Handle sort key if present
    if ("sk" in key && key.sk !== undefined && "sk" in index) {
      if (typeof key.sk === "string") {
        result.sk = key.sk;
      } else {
        // Convert from old object format to new standardized format
        const oldSk = key.sk as KeyConditionExprSK;
        result.sk = this.convertSortKeyCondition(oldSk);
      }
    }

    return result;
  }

  private convertSortKeyCondition(
    condition: KeyConditionExprSK,
  ): KeyConditionExpr<string> {
    if ("beginsWith" in condition) {
      return { type: "beginsWith", value: condition.beginsWith };
    } else if ("<" in condition) {
      return { type: "<", value: condition["<"] };
    } else if ("<=" in condition) {
      return { type: "<=", value: condition["<="] };
    } else if (">" in condition) {
      return { type: ">", value: condition[">"] };
    } else if (">=" in condition) {
      return { type: ">=", value: condition[">="] };
    } else if ("=" in condition) {
      return { type: "=", value: condition["="] };
    } else if ("between" in condition) {
      return { type: "between", value: condition.between };
    } else {
      throw new Error("Unknown sort key condition format");
    }
  }
}
