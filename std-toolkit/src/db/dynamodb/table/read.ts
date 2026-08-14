import { Effect, Schema } from 'effect';
import type { EncodedKey } from '../../std-table/contract/index.js';
import type { DynamoDBClient } from '../client/index.js';
import {
  decodeKey,
  type DecodedItem,
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
  key: EncodedKey,
) =>
  Effect.try({
    try: () => decodeKey(table, key),
    catch: contractFailure,
  }).pipe(
    Effect.flatMap((Key) => client.getItem({ TableName: tableName, Key })),
    Effect.flatMap(({ Item }) =>
      Item === undefined
        ? Effect.succeed(null)
        : Schema.encodeEffect(schema)(Item as DecodedItem),
    ),
    Effect.mapError(contractFailure),
  );
