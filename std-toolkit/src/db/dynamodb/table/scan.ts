import { Effect, Schema } from 'effect';
import type { ScanRequest } from '../../std-table/contract/index.js';
import type { DynamoDBClient } from '../client/index.js';
import { contractFailure } from './failure.js';
import type { NativeItem, ItemSchema } from '../item-schema/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';

type DynamoTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export const scanItems = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
  schema: ItemSchema,
  request: ScanRequest,
) => {
  const startKey =
    request.startAfter === undefined
      ? undefined
      : {
          [table.primary.pk]: { S: request.startAfter.pk },
          [table.primary.sk]: { S: request.startAfter.sk },
        };
  return client
    .scan({
      TableName: tableName,
      Limit: request.limit,
      ...(request.totalSegments === undefined
        ? {}
        : {
            TotalSegments: request.totalSegments,
            Segment: request.segment ?? 0,
          }),
      ...(startKey === undefined ? {} : { ExclusiveStartKey: startKey }),
    })
    .pipe(
      Effect.mapError(contractFailure),
      Effect.flatMap((result) =>
        Effect.forEach(result.Items ?? [], (item) =>
          Schema.encodeEffect(schema)(item as NativeItem),
        ).pipe(
          Effect.map((items) => ({
            items,
            hasMore:
              result.LastEvaluatedKey !== undefined &&
              Object.keys(result.LastEvaluatedKey).length > 0,
          })),
          Effect.mapError(contractFailure),
        ),
      ),
    );
};
