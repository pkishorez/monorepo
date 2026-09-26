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

/** Creates the physical table when it is missing; never alters an existing one. */
export const ensureSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) =>
  database.run(Statement.createTable(tableName, table).sql).pipe(
    Effect.asVoid,
    Effect.mapError((cause) => new OperationFailure({ cause })),
  );

/** Adds missing index columns and indexes, and replaces incompatible ones. */
export const reconcileSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) =>
  reconcileSQLiteTopology(database, table, tableName).pipe(
    Effect.mapError((cause) => new OperationFailure({ cause })),
  );
