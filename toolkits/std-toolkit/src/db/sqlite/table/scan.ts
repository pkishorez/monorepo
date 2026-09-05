import { Effect } from 'effect';
import {
  OperationFailure,
  type ScanRequest,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type { SQLiteDriver } from '../database/index.js';
import { Statement } from '../statement/index.js';
import type { ItemSchema } from '../item-schema/index.js';
import { encodeRows } from './read.js';

export const scanItems = (
  database: SQLiteDriver,
  table: Pick<
    TableDefinition,
    'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
  >,
  tableName: string,
  schema: ItemSchema,
  request: ScanRequest,
) => {
  if (request.segment !== undefined && request.segment > 0)
    return Effect.succeed({ items: [], hasMore: false });
  const statement = Statement.scan(tableName, table, request);
  return database.all(statement.sql, statement.parameters).pipe(
    Effect.mapError((cause) => new OperationFailure({ cause })),
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
