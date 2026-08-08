import type { Effect } from 'effect';

import type {
  IndexDefinition,
  MarshalledOutput,
  TransactWrite,
} from '../../types/index.js';

interface EntityQueryResult {
  readonly Items: Record<string, unknown>[];
  readonly LastEvaluatedKey?: Record<string, unknown>;
}

export interface EntityTable<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> {
  readonly primary: TPrimaryIndex;
  readonly secondaryIndexMap: TSecondaryIndexMap;
  readonly getItem: (
    key: IndexDefinition,
    options?: { ConsistentRead?: boolean },
  ) => Effect.Effect<{ Item: Record<string, unknown> | null }, any, any>;
  readonly putItem: (
    value: Record<string, unknown>,
    options?: {
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
      ReturnValues?: 'ALL_OLD';
    },
  ) => Effect.Effect<{ Attributes: Record<string, unknown> | null }, any, any>;
  readonly updateItem: (
    key: IndexDefinition,
    options: {
      UpdateExpression?: string;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
      ReturnValues?: 'ALL_NEW' | 'ALL_OLD';
      ReturnValuesOnConditionCheckFailure?: 'ALL_OLD' | 'NONE';
    },
  ) => Effect.Effect<{ Attributes: Record<string, unknown> | null }, any, any>;
  readonly deleteItem: (key: IndexDefinition) => Effect.Effect<void, any, any>;
  readonly query: (
    condition: any,
    options?: any,
  ) => Effect.Effect<EntityQueryResult, any, any>;
  readonly queryIndex: (
    indexName: string,
    condition: any,
    options?: any,
  ) => Effect.Effect<EntityQueryResult, any, any>;
  readonly batchWrite: (
    items: Record<string, unknown>[],
  ) => Effect.Effect<{ unprocessedIndexes: number[] }, any, any>;
  opPutItem(
    value: Record<string, unknown>,
    options?: {
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
    },
  ): TransactWrite;
  opUpdateItem(
    key: IndexDefinition,
    options: {
      UpdateExpression: string;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
    },
  ): TransactWrite;
}

export interface EntityMetadata {
  readonly _e: string;
  readonly _v: string;
  readonly _u: string;
  readonly _d: boolean;
}

export type MigrationOutcome = 'missing' | 'current' | 'migrate';

export const makeEntityMetadata = (
  entityName: string,
  version: string,
  updateId: string,
  deleted = false,
): EntityMetadata => ({
  _e: entityName,
  _v: version,
  _u: updateId,
  _d: deleted,
});

export const semanticItem = (
  item: Readonly<Record<string, unknown>>,
  ignoredAttributes: ReadonlySet<string>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(item).filter(
      ([key]) => key !== '_u' && !ignoredAttributes.has(key),
    ),
  );

export const migrationOutcome = (
  item: Readonly<Record<string, unknown>> | undefined,
  latestVersion: string,
): MigrationOutcome =>
  item === undefined
    ? 'missing'
    : item._v === latestVersion
      ? 'current'
      : 'migrate';
