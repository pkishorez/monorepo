import { Effect, Schema } from 'effect';
import type { StoredKey } from '../../std-table/contract/index.js';
import type { DynamoDBClient } from '../client/index.js';
import {
  toNativeKey,
  type NativeItem,
  type ItemSchema,
} from '../item-schema/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { contractFailure } from './failure.js';

export const getItem = (
  client: DynamoDBClient,
  table: Pick<
    TableDefinition,
    'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
  >,
  tableName: string,
  schema: ItemSchema,
  key: StoredKey,
  options?: { readonly consistent?: boolean },
) =>
  Effect.try({
    try: () => toNativeKey(table, key),
    catch: contractFailure,
  }).pipe(
    Effect.flatMap((Key) =>
      client.getItem({
        TableName: tableName,
        Key,
        ...(options?.consistent === undefined
          ? {}
          : { ConsistentRead: options.consistent }),
      }),
    ),
    Effect.flatMap(({ Item }) =>
      Item === undefined
        ? Effect.succeed(null)
        : Schema.encodeEffect(schema)(Item as NativeItem),
    ),
    Effect.mapError(contractFailure),
  );
