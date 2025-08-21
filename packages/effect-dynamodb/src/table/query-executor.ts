import type { DynamoDB, QueryInput, ScanInput } from 'dynamodb-client';
import type {
  ConditionExprParameters,
  KeyConditionExprParameters,
} from './expr/index.js';
import type { IndexDefinition, KeyFromIndex } from './types.js';
import { expr, keyCondition, projectionExpr } from './expr/index.js';
import { marshall } from './utils.js';

export type QueryOptions<Index extends IndexDefinition> = Omit<
  QueryInput,
  | 'TableName'
  | 'Key'
  | 'IndexName'
  | 'ExpressionAttributeNames'
  | 'ExpressionAttributeValues'
  | 'ExclusiveStartKey'
  | 'ProjectionExpression'
> & {
  projection?: string[];
  filter?: ConditionExprParameters<any>;
  exclusiveStartKey?: KeyFromIndex<Index> | undefined;
};

export type ScanOptions<Index extends IndexDefinition> = Omit<
  ScanInput,
  | 'TableName'
  | 'Key'
  | 'IndexName'
  | 'ExpressionAttributeNames'
  | 'ExpressionAttributeValues'
  | 'ExclusiveStartKey'
  | 'ProjectionExpression'
> & {
  projection?: string[];
  filter?: ConditionExprParameters<any>;
  exclusiveStartKey?: KeyFromIndex<Index>;
};

export class DynamoQueryExecutor {
  constructor(
    private client: DynamoDB,
    private tableName: string,
  ) {}

  executeQuery<TIndex extends IndexDefinition>(
    key: KeyConditionExprParameters<TIndex>,
    index: TIndex,
    {
      projection,
      exclusiveStartKey,
      filter,
      indexName,
      ...options
    }: QueryOptions<TIndex> & { indexName?: string } = {},
  ) {
    const keyExpressions = keyCondition(index, key);
    const queryOptions: QueryInput = {
      TableName: this.tableName,
      ...options,
      KeyConditionExpression: keyExpressions.expr,
      ExpressionAttributeNames: keyExpressions.exprAttributes,
      ExpressionAttributeValues: marshall(keyExpressions.exprValues),
    };

    if (indexName) {
      queryOptions.IndexName = indexName;
    }
    if (projection) {
      const { expr: condition, exprAttributes } = projectionExpr(projection);
      queryOptions.ProjectionExpression = condition;
      queryOptions.ExpressionAttributeNames = {
        ...queryOptions.ExpressionAttributeNames,
        ...exprAttributes,
      };
    }
    if (filter) {
      const { expr: condition, exprAttributes, exprValues } = expr(filter);
      queryOptions.ExpressionAttributeNames = {
        ...queryOptions.ExpressionAttributeNames,
        ...exprAttributes,
      };
      queryOptions.ExpressionAttributeValues = {
        ...queryOptions.ExpressionAttributeValues,
        ...marshall(exprValues),
      };
      queryOptions.FilterExpression = condition;
    }

    // Handle ExclusiveStartKey marshalling
    if (exclusiveStartKey) {
      queryOptions.ExclusiveStartKey = marshall(exclusiveStartKey);
    }

    return this.client.query(queryOptions);
  }

  executeScan<TIndex extends IndexDefinition>({
    projection,
    exclusiveStartKey,
    filter,
    indexName,
    ...options
  }: ScanOptions<TIndex> & { indexName?: string } = {}) {
    const scanOptions: ScanInput = {
      TableName: this.tableName,
      ...options,
    };

    if (projection) {
      const { expr: condition, exprAttributes } = projectionExpr(projection);
      scanOptions.ProjectionExpression = condition;
      scanOptions.ExpressionAttributeNames = {
        ...scanOptions.ExpressionAttributeNames,
        ...exprAttributes,
      };
    }
    if (indexName) {
      scanOptions.IndexName = indexName;
    }
    if (filter) {
      const { expr: condition, exprAttributes, exprValues } = expr(filter);
      scanOptions.ExpressionAttributeNames = {
        ...scanOptions.ExpressionAttributeNames,
        ...exprAttributes,
      };
      scanOptions.ExpressionAttributeValues = {
        ...scanOptions.ExpressionAttributeValues,
        ...marshall(exprValues),
      };
      scanOptions.FilterExpression = condition;
    }
    if (exclusiveStartKey) {
      scanOptions.ExclusiveStartKey = marshall(exclusiveStartKey);
    }

    return this.client.scan(scanOptions);
  }
}
