import type { ConsumedCapacity, ItemCollectionMetrics } from 'dynamodb-client';

// Core index definitions
export interface SimpleIndexDefinition {
  pk: string;
}

export interface CompoundIndexDefinition {
  pk: string;
  sk: string;
}

export type IndexDefinition = SimpleIndexDefinition | CompoundIndexDefinition;

export type SecondaryIndexDefinition = IndexDefinition;

// Utility type to simplify complex type intersections
export type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};

export interface DynamoConfig {
  region?: string;
  accessKey: string;
  secretKey: string;
  endpoint?: string;
}

export type KeyFromIndex<T extends IndexDefinition> = T extends {
  sk: infer SK;
  pk: infer PK;
}
  ? { [K in PK as K extends string ? K : never]: string } & {
      [K in SK as K extends string ? K : never]: string;
    }
  : T extends { pk: infer PK }
    ? { [K in PK as K extends string ? K : never]: string }
    : never;

export type ItemWithKeys<TPrimary extends IndexDefinition> =
  KeyFromIndex<TPrimary> & Record<string, unknown>;

// Extract all keys from GSIs and LSIs to make them optional
export type AllGLSIKeys<TGLSIs extends Record<string, IndexDefinition>> =
  keyof TGLSIs extends never
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : {
        [K in keyof TGLSIs]: TGLSIs[K] extends IndexDefinition
          ? KeyFromIndex<TGLSIs[K]>
          : never;
      }[keyof TGLSIs];

export type ItemForPut<
  TPrimary extends IndexDefinition,
  TGSIs extends Record<string, IndexDefinition>,
  TLSIs extends Record<string, IndexDefinition>,
> = KeyFromIndex<TPrimary> &
  Partial<AllGLSIKeys<TGSIs>> &
  Partial<AllGLSIKeys<TLSIs>> &
  Record<string, unknown>;

export type ItemForUpdate<
  TPrimary extends IndexDefinition,
  TGSIs extends Record<string, IndexDefinition>,
  TLSIs extends Record<string, IndexDefinition>,
> = Partial<
  Omit<ItemForPut<TPrimary, TGSIs, TLSIs>, keyof KeyFromIndex<TPrimary>>
>;


// Enhanced response types with monitoring data
export interface EnhancedQueryResult<T> {
  Items: T[];
  Count?: number | undefined;
  ScannedCount?: number | undefined;
  LastEvaluatedKey?: Record<string, unknown> | undefined;
  ConsumedCapacity?: ConsumedCapacity | undefined;
}

export interface EnhancedScanResult<T> {
  Items: T[];
  Count?: number | undefined;
  ScannedCount?: number | undefined;
  LastEvaluatedKey?: Record<string, unknown> | undefined;
  ConsumedCapacity?: ConsumedCapacity | undefined;
}

export interface EnhancedGetItemResult<T> {
  Item: T | null;
  ConsumedCapacity?: ConsumedCapacity | undefined;
}

export interface EnhancedUpdateResult<T> {
  Attributes?: T | undefined;
  ConsumedCapacity?: ConsumedCapacity | undefined;
  ItemCollectionMetrics?: ItemCollectionMetrics | undefined;
}

export interface EnhancedPutResult {
  Attributes?: Record<string, unknown> | undefined;
  ConsumedCapacity?: ConsumedCapacity | undefined;
  ItemCollectionMetrics?: ItemCollectionMetrics | undefined;
}

export interface EnhancedDeleteResult {
  Attributes?: Record<string, unknown> | undefined;
  ConsumedCapacity?: ConsumedCapacity | undefined;
  ItemCollectionMetrics?: ItemCollectionMetrics | undefined;
}


export interface BatchWriteRequest<
  TPrimary extends IndexDefinition,
  TGSIs extends Record<string, IndexDefinition>,
  TLSIs extends Record<string, IndexDefinition>,
> {
  putRequests?: ItemForPut<TPrimary, TGSIs, TLSIs>[];
  deleteRequests?: KeyFromIndex<TPrimary>[];
}

export interface BatchGetResult<T> {
  Items: T[];
  UnprocessedKeys?:
    | {
        Keys: KeyFromIndex<any>[];
        ProjectionExpression?: string | undefined;
        ExpressionAttributeNames?: Record<string, string> | undefined;
      }
    | undefined;
  ConsumedCapacity?: ConsumedCapacity[] | undefined;
}

export interface BatchWriteResult {
  UnprocessedItems?:
    | {
        PutRequest?: Record<string, unknown>[] | undefined;
        DeleteRequest?: { Key: Record<string, unknown> }[] | undefined;
      }
    | undefined;
  ItemCollectionMetrics?: Record<string, ItemCollectionMetrics[]> | undefined;
  ConsumedCapacity?: ConsumedCapacity[] | undefined;
}


export interface TransactWriteItem<
  TPrimary extends IndexDefinition,
  TGSIs extends Record<string, IndexDefinition>,
  TLSIs extends Record<string, IndexDefinition>,
> {
  put?: {
    item: ItemForPut<TPrimary, TGSIs, TLSIs>;
    conditionExpression?: string;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, unknown>;
    returnValuesOnConditionCheckFailure?: 'ALL_OLD' | 'NONE';
  };
  update?: {
    key: KeyFromIndex<TPrimary>;
    updateExpression: string;
    conditionExpression?: string;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, unknown>;
    returnValuesOnConditionCheckFailure?: 'ALL_OLD' | 'NONE';
  };
  delete?: {
    key: KeyFromIndex<TPrimary>;
    conditionExpression?: string;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, unknown>;
    returnValuesOnConditionCheckFailure?: 'ALL_OLD' | 'NONE';
  };
  conditionCheck?: {
    key: KeyFromIndex<TPrimary>;
    conditionExpression: string;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, unknown>;
  };
}

export interface TransactGetItem<TPrimary extends IndexDefinition> {
  key: KeyFromIndex<TPrimary>;
  projectionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
}

export interface TransactWriteResult {
  ItemCollectionMetrics?: Record<string, ItemCollectionMetrics[]> | undefined;
  ConsumedCapacity?: ConsumedCapacity[] | undefined;
}

export interface TransactGetResult<T> {
  Items: (T | null)[];
  ConsumedCapacity?: ConsumedCapacity[] | undefined;
}

// EXPERSSIONS.
export type KeyConditionExprSK =
  | { beginsWith: string }
  | { '<': string }
  | { '<=': string }
  | { '>': string }
  | { '>=': string }
  | { '=': string }
  | { between: [string, string] };

export type KeyConditionExprParameters<Index extends IndexDefinition> =
  Index extends CompoundIndexDefinition
    ? { pk: string; sk?: string | KeyConditionExprSK }
    : { pk: string; note?: 'simple pk' };
