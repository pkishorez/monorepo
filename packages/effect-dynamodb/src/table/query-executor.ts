import type { DynamoDB, QueryInput, ScanInput } from 'dynamodb-client';
import type {
  ConditionExprParameters,
  KeyConditionExprParameters,
} from './expr/index.js';
import type { ProjectionKeys } from './expr/projection.js';
import type { IndexDefinition, RealKeyFromIndex } from './types.js';
import { buildExpression } from './expr/index.js';
import { marshall } from './utils.js';

export type QueryOptions<Index extends IndexDefinition, Item> = Omit<
  QueryInput,
  | 'TableName'
  | 'Key'
  | 'IndexName'
  | 'ExpressionAttributeNames'
  | 'ExpressionAttributeValues'
  | 'ExclusiveStartKey'
  | 'ProjectionExpression'
> & {
  filter?: ConditionExprParameters<Item>;
  projection?: ProjectionKeys<Item, Index>;
  exclusiveStartKey?: RealKeyFromIndex<Index> | undefined;
};

export type ScanOptions<Index extends IndexDefinition, TItem> = Omit<
  ScanInput,
  | 'TableName'
  | 'IndexName'
  | 'ExpressionAttributeNames'
  | 'ExpressionAttributeValues'
  | 'ExclusiveStartKey'
  | 'ProjectionExpression'
> & {
  filter?: ConditionExprParameters<TItem>;
  projection?: ProjectionKeys<TItem, Index>;
  exclusiveStartKey?: RealKeyFromIndex<Index>;
};

export class DynamoQueryExecutor<TItem> {
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
    }: QueryOptions<TIndex, TItem> & { indexName?: string } = {},
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
  }: ScanOptions<TIndex, TItem> & { indexName?: string } = {}) {
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
