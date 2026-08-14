import { Effect } from 'effect';
import {
  OperationFailure,
  type QueryRequest,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type { SQLiteDriver } from '../database/index.js';
import { Statement } from '../statement/index.js';
import type { ItemSchema } from '../item-schema/index.js';
import { encodeRows } from './read.js';

export const queryItems = (
  database: SQLiteDriver,
  table: Pick<
    TableDefinition,
    'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
  >,
  tableName: string,
  schema: ItemSchema,
  request: QueryRequest,
) => {
  const startAfter = request.startAfter;
  const cursor =
    startAfter === undefined
      ? undefined
      : {
          indexSk: startAfter.indexSk ?? startAfter.sk,
          pk: startAfter.pk,
          sk: startAfter.sk,
        };

  return Effect.try({
    try: () => Statement.query(tableName, table, request, cursor),
    catch: (cause) => new OperationFailure({ cause }),
  }).pipe(
    Effect.flatMap((statement) =>
      database
        .all(statement.sql, statement.parameters)
        .pipe(Effect.mapError((cause) => new OperationFailure({ cause }))),
    ),
    Effect.flatMap((rows) =>
      encodeRows(schema, rows.slice(0, request.limit)).pipe(
        Effect.map((items) => ({
          items,
          hasMore: rows.length > request.limit,
        })),
      ),
    ),
  );
};
