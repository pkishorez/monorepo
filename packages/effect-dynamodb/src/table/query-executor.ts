import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  EnhancedQueryResult,
  EnhancedScanResult,
  IndexDefinition,
  ItemWithKeys,
  KeyConditionExprParameters,
  KeyConditionExprSK,
  QueryOptions,
  ScanOptions,
} from './types.js';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { Effect } from 'effect';

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
    const expressionAttributeNames: Record<string, string> = {
      ...(options?.expressionAttributeNames || {}),
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ...(options?.expressionAttributeValues || {}),
    };
    const conditions: string[] = [];

    // Build partition key condition
    expressionAttributeNames[`#pk`] = index.pk;
    expressionAttributeValues[`:pk_value`] = key.pk;
    conditions.push(`#pk = :pk_value`);

    // Build sort key condition if present
    if ('sk' in key && key.sk !== undefined && 'sk' in index) {
      if (typeof key.sk === 'string') {
        expressionAttributeNames[`#sk`] = index.sk;
        expressionAttributeValues[`:sk_value`] = key.sk;
        conditions.push(`#sk = :sk_value`);
      } else {
        this.buildSortKeyCondition(
          index.sk,
          key.sk as any,
          expressionAttributeNames,
          expressionAttributeValues,
          conditions,
        );
      }
    }

    return {
      KeyConditionExpression: conditions.join(' AND '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };
  }

  private buildSortKeyCondition(
    keyName: string,
    condition: KeyConditionExprSK,
    expressionAttributeNames: Record<string, string>,
    expressionAttributeValues: Record<string, unknown>,
    conditions: string[],
  ) {
    expressionAttributeNames[`#sk`] = keyName;

    if ('between' in condition) {
      const [start, end] = condition.between;
      expressionAttributeValues[`:sk_start`] = start;
      expressionAttributeValues[`:sk_end`] = end;
      conditions.push(`#sk BETWEEN :sk_start AND :sk_end`);
    } else if ('beginsWith' in condition) {
      expressionAttributeValues[`:sk_begins_with`] = condition.beginsWith;
      conditions.push(`begins_with(#sk, :sk_begins_with)`);
    } else if ('<' in condition) {
      expressionAttributeValues[`:sk_lt`] = condition['<'];
      conditions.push(`#sk < :sk_lt`);
    } else if ('<=' in condition) {
      expressionAttributeValues[`:sk_lte`] = condition['<='];
      conditions.push(`#sk <= :sk_lte`);
    } else if ('>' in condition) {
      expressionAttributeValues[`:sk_gt`] = condition['>'];
      conditions.push(`#sk > :sk_gt`);
    } else if ('>=' in condition) {
      expressionAttributeValues[`:sk_gte`] = condition['>='];
      conditions.push(`#sk >= :sk_gte`);
    } else if ('=' in condition) {
      expressionAttributeValues[`:sk_eq`] = condition['='];
      conditions.push(`#sk = :sk_eq`);
    }
  }
}
