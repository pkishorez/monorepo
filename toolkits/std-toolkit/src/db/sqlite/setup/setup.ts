import { Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { OperationFailure } from '../../std-table/contract/index.js';
import type { SetupTopology } from '../../setup/index.js';
import type { SQLiteDriver } from '../database/index.js';
import { Statement } from '../statement/index.js';
import { reconcileSQLiteTopology } from './topology.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const failed = (cause: unknown) => new OperationFailure({ cause });

const numberValue = (value: unknown) =>
  typeof value === 'bigint' ? Number(value) : value;

/**
 * Creates the physical table when it is missing, so setup can read the
 * Stored contract kept in it. An existing table must already have the
 * declared primary key: its rows, contract included, are keyed by it, and
 * SQLite cannot change a primary key in place.
 */
export const ensureSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) =>
  Effect.gen(function* () {
    const columns = yield* database.all(Statement.tableInfo(tableName).sql);
    if (columns.length === 0) {
      yield* database.run(Statement.createTable(tableName, table).sql);
      return;
    }
    const position = (column: (typeof columns)[number]) =>
      Number(numberValue(column.pk));
    const primary = columns
      .filter((column) => position(column) > 0)
      .toSorted((left, right) => position(left) - position(right))
      .map(({ name }) => String(name));
    const declared = [table.primary.pk, table.primary.sk];
    if (
      primary.length !== declared.length ||
      primary.some((name, index) => name !== declared[index])
    )
      return yield* Effect.fail(
        new Error(
          `SQLite table "${tableName}" has primary key (${primary.join(', ')}), not the declared (${declared.join(', ')}). A new primary key needs a new physical table name.`,
        ),
      );
  }).pipe(Effect.mapError(failed));

/**
 * SQLite's part of setup: it adds the index columns the snapshot needs,
 * creates its indexes, replaces incompatible ones and drops the ones setup
 * made for indexes no longer declared. SQLite makes every index change in
 * place, so it refuses nothing of its own.
 */
export const sqliteTopology = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
): SetupTopology => ({
  apply: () =>
    reconcileSQLiteTopology(database, table, tableName).pipe(
      Effect.mapError(failed),
    ),
});
