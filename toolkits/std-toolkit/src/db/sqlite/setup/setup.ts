import { Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { OperationFailure } from '../../std-table/contract/index.js';
import type { SQLiteDriver } from '../database/index.js';
import { Statement } from '../statement/index.js';
import { reconcileSQLiteTopology } from './topology.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export const setupSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) => {
  const createTable = Statement.createTable(tableName, table);
  return database.run(createTable.sql).pipe(
    Effect.andThen(reconcileSQLiteTopology(database, table, tableName)),
    Effect.mapError((cause) => new OperationFailure({ cause })),
  );
};
