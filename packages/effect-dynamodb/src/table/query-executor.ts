import type { DynamoDB, QueryInput, ScanInput } from 'dynamodb-client';
import type { ExprInput, KeyConditionExprParameters } from './expr/index.js';
import type { IndexDefinition, RealKeyFromIndex } from './types.js';
import { buildExpression } from './expr/index.js';
import { marshall } from './utils.js';

export type QueryOptions<Index extends IndexDefinition, Type> = Omit<
  QueryInput,
  | 'TableName'
  | 'Key'
  | 'IndexName'
  | 'ExpressionAttributeNames'
  | 'ExpressionAttributeValues'
  | 'ExclusiveStartKey'
  | 'ProjectionExpression'
> & {
  filter?: ExprInput<Type>;
  projection?: string[];
  exclusiveStartKey?: RealKeyFromIndex<Index> | undefined;
};

export type ScanOptions<Index extends IndexDefinition, Type> = Omit<
  ScanInput,
  | 'TableName'
  | 'IndexName'
  | 'ExpressionAttributeNames'
  | 'ExpressionAttributeValues'
  | 'ExclusiveStartKey'
  | 'ProjectionExpression'
> & {
  filter?: ExprInput<Type>;
  projection?: string[];
  exclusiveStartKey?: RealKeyFromIndex<Index>;
};

export class DynamoQueryExecutor<Type> {
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
    }: QueryOptions<TIndex, Type> & { indexName?: string } = {},
  ) {
    // Build all expressions at once
    const result = buildExpression({
      keyCondition: { index, params: key },
      projection,
      filter,
    });

    const queryOptions: QueryInput = {
      TableName: this.tableName,
      ...options,
      ...result,
    };

    if (indexName) {
      queryOptions.IndexName = indexName;
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
  }: ScanOptions<TIndex, Type> & { indexName?: string } = {}) {
    // Build all expressions at once
    const result = buildExpression({
      projection,
      filter,
    });

    const scanOptions: ScanInput = {
      TableName: this.tableName,
      ...options,
      ...result,
    };

    if (indexName) {
      scanOptions.IndexName = indexName;
    }
    if (exclusiveStartKey) {
      scanOptions.ExclusiveStartKey = marshall(exclusiveStartKey);
    }

    return this.client.scan(scanOptions);
  }
}
