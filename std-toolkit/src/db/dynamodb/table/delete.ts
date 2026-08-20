import { Effect } from 'effect';
import type {
  ContractFailure,
  EncodedKey,
} from '../../std-table/contract/index.js';
import type {
  AttributeValue,
  DynamoDBClient,
  ScanOutput,
} from '../client/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { buildExpr, exprFilter } from '../expression/index.js';
import { decodeKey, itemKey, type NativeItem } from '../item-schema/index.js';
import { contractFailure } from './failure.js';

const deleteMatchingItems = (
  client: DynamoDBClient,
  table: DynamoTable,
  scanInput: Omit<Parameters<DynamoDBClient['scan']>[0], 'ExclusiveStartKey'>,
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
  key: EncodedKey,
) =>
  Effect.try({
    try: () => decodeKey(table, key),
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

export const hardDeleteAllItems = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
) => deleteMatchingItems(client, table, { TableName: tableName });
type DynamoTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;
