import { Effect } from 'effect';
import {
  isInternalEntity,
  type ContractFailure,
  type StoredKey,
} from '../../std-table/contract/index.js';
import type {
  AttributeValue,
  DynamoDBClient,
  ScanOutput,
} from '../client/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { buildExpr, exprFilter } from '../expression/index.js';
import { toNativeKey, itemKey, type NativeItem } from '../item-schema/index.js';
import { contractFailure } from './failure.js';

const deleteMatchingItems = (
  client: DynamoDBClient,
  table: DynamoTable,
  scanInput: Omit<Parameters<DynamoDBClient['scan']>[0], 'ExclusiveStartKey'>,
  keep: (item: NativeItem) => boolean = () => false,
): Effect.Effect<number, ContractFailure> =>
  Effect.gen(function* () {
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;
    let deleted = 0;

    do {
      const page: ScanOutput = yield* client.scan({
        ...scanInput,
        ...(exclusiveStartKey === undefined
          ? {}
          : { ExclusiveStartKey: exclusiveStartKey }),
      });
      for (const item of page.Items ?? []) {
        if (keep(item as NativeItem)) continue;
        const key = yield* Effect.try({
          try: () => itemKey(table, item as NativeItem),
          catch: contractFailure,
        });
        yield* client.deleteItem({ TableName: scanInput.TableName, Key: key });
        deleted++;
      }
      exclusiveStartKey =
        page.LastEvaluatedKey === undefined ||
        Object.keys(page.LastEvaluatedKey).length === 0
          ? undefined
          : page.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);

    return deleted;
  }).pipe(Effect.mapError(contractFailure));

export const hardDeleteItem = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
  key: StoredKey,
) =>
  Effect.try({
    try: () => toNativeKey(table, key),
    catch: contractFailure,
  }).pipe(
    Effect.flatMap((Key) => client.deleteItem({ TableName: tableName, Key })),
    Effect.asVoid,
    Effect.mapError(contractFailure),
  );

export const hardDeleteEntityItems = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
  entity: string,
) =>
  deleteMatchingItems(client, table, {
    TableName: tableName,
    ...buildExpr({
      filter: exprFilter<{ readonly _e: string }>(($) =>
        $.cond('_e', '=', entity),
      ),
    }),
  });

/** Every item but the internal entities', which describe the table itself. */
export const hardDeleteAllItems = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
) =>
  deleteMatchingItems(client, table, { TableName: tableName }, (item) => {
    const entity = item._e;
    return (
      typeof entity === 'object' &&
      entity !== null &&
      'S' in entity &&
      typeof entity.S === 'string' &&
      isInternalEntity(entity.S)
    );
  });
type DynamoTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;
