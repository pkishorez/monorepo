import { Effect } from 'effect';
import type { TableSnapshot } from '../../../snapshot/index.js';
import { Migrations } from '../../../migrations/index.js';
import {
  SnapshotEntities,
  type TableDefinition,
} from '../../std-table/definition/index.js';
import {
  ConditionFailure,
  conditionFailed,
  OperationFailure,
  type StdTableContract,
} from '../../std-table/contract/index.js';
import {
  checkTableSnapshot,
  type SetupRefused,
  type StoredSnapshot,
  type TableMode,
} from '../../table-snapshot/index.js';
import { SQLiteChangesMismatch, type SQLiteDriver } from '../database/index.js';
import { Statement } from '../statement/index.js';
import { makeTableContract } from '../table/index.js';
import {
  invalidBaseColumns,
  numberValue,
  reconcileSQLiteTopology,
  validateSQLiteTopology,
} from './topology.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

type Primary = SQLiteTable['primary'];

const failed = (cause: unknown) =>
  cause instanceof OperationFailure ? cause : new OperationFailure({ cause });

/** Creates the physical table when it is missing; never alters an existing one. */
export const ensureSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) =>
  database
    .run(Statement.createTable(tableName, table).sql)
    .pipe(Effect.asVoid, Effect.mapError(failed));

/** Adds missing index columns and indexes, and replaces incompatible ones. */
export const reconcileSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) =>
  reconcileSQLiteTopology(database, table, tableName).pipe(
    Effect.mapError(failed),
  );

/**
 * The physical table's primary key columns. The check reads through them,
 * since a table set up under another primary key must still be read before
 * it is refused or wiped. Fails when the table is no std-toolkit table.
 */
const physicalPrimary = (database: SQLiteDriver, tableName: string) =>
  Effect.gen(function* () {
    const columns = yield* database.all(Statement.tableInfo(tableName).sql);
    const at = (position: number) =>
      columns.find((column) => numberValue(column.pk) === position)?.name;
    const [pk, sk, extra] = [at(1), at(2), at(3)];
    if (typeof pk !== 'string' || typeof sk !== 'string' || extra !== undefined)
      return yield* Effect.fail(
        new Error(
          `SQLite table "${tableName}" has an incompatible primary index`,
        ),
      );
    const primary: Primary = { pk, sk };
    const invalid = invalidBaseColumns({ primary }, columns);
    if (invalid.length > 0)
      return yield* Effect.fail(
        new Error(
          `SQLite table "${tableName}" has an incompatible base schema: ${invalid.join(', ')}`,
        ),
      );
    return primary;
  }).pipe(Effect.mapError(failed));

// The internal entities have no secondary keys, so the check writes only the
// base columns: an index column the topology still has to add is not needed.
const baseTopology = (primary: Primary): SQLiteTable => ({
  primary,
  localSecondaryIndexes: {},
  globalSecondaryIndexes: {},
});

/**
 * The StdTable contract over the physical table's base columns, switched to
 * the code's primary key once a wipe has recreated the table under it.
 */
const checkContract = (
  database: SQLiteDriver,
  tableName: string,
  primary: Primary,
) => {
  let physical = primary;
  let current = makeTableContract(database, baseTopology(primary), tableName);
  const contract: StdTableContract = {
    getItem: (key, options) => current.getItem(key, options),
    queryItems: (request) => current.queryItems(request),
    scanItems: (request) => current.scanItems(request),
    writeItem: (put) => current.writeItem(put),
    transactWriteItems: (items) => current.transactWriteItems(items),
    hardDeleteItem: (key) => current.hardDeleteItem(key),
    hardDeleteEntityItems: (entity) => current.hardDeleteEntityItems(entity),
    hardDeleteAllItems: () => current.hardDeleteAllItems(),
  };
  const recreatedUnder = (next: Primary) => {
    physical = next;
    current = makeTableContract(database, baseTopology(next), tableName);
  };
  return { contract, recreatedUnder, currentPrimary: () => physical };
};

/**
 * Drops and recreates the table under the code's topology, in one
 * transaction that holds only while `__snapshot` is still the one the plan
 * was made from: a setup deciding on a stale read never wipes a table another
 * setup changed meanwhile, and starts over instead.
 */
const wipeTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
  stored: StoredSnapshot,
) =>
  database
    .transaction([
      Statement.entityGuard(
        tableName,
        SnapshotEntities.snapshot.name,
        stored.snapshot?.meta._u,
      ),
      Statement.dropTable(tableName),
      Statement.createTable(tableName, table),
    ])
    .pipe(
      Effect.mapError((cause) =>
        cause instanceof SQLiteChangesMismatch
          ? conditionFailed()
          : failed(cause),
      ),
    );

const hasRows = (database: SQLiteDriver, tableName: string) => {
  const statement = Statement.hasRows(tableName);
  return database.all(statement.sql, statement.parameters).pipe(
    Effect.map((rows) => rows.length > 0),
    Effect.mapError(failed),
  );
};

const samePrimary = (left: Primary, right: Primary) =>
  left.pk === right.pk && left.sk === right.sk;

/**
 * SQLite cannot change a primary key in place, and only a wipe recreates the
 * table: a plan that keeps a table under another primary key could neither
 * reconcile it nor be undone once its snapshot claimed the code's.
 */
const refuseOtherPrimary = (
  tableName: string,
  physical: Primary,
  code: Primary,
) =>
  Effect.fail(
    failed(
      new Error(
        `SQLite table "${tableName}" has the primary key (${physical.pk}, ${physical.sk}), not the code's (${code.pk}, ${code.sk}), and SQLite cannot change it in place. Nothing was changed. Declare the primary key the table has, or move its data to a new table.`,
      ),
    ),
  );

/**
 * Prepares the physical table under the snapshot it keeps in its own
 * internal entities (ADR 0020), in this order:
 *
 * 1. Creates the table when it is missing; an existing one is left as it is.
 * 2. Checks, changing nothing, that the table can take the topology.
 * 3. Runs the registered migrations.
 * 4. Checks the stored snapshot against the code's: a refusal writes
 *    nothing; a disposable table's wipe drops and recreates it; a table
 *    still under another primary key is refused; otherwise the changed
 *    snapshot items are written.
 * 5. Adds missing index columns and indexes, and replaces incompatible ones.
 *
 * Index changes wait for step 5, so a refused change leaves the table, its
 * indexes and its rows as they were.
 */
export const setUpSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
  snapshot: TableSnapshot,
  mode: TableMode,
): Effect.Effect<void, OperationFailure | SetupRefused> =>
  Effect.gen(function* () {
    yield* ensureSQLiteTable(database, table, tableName);
    const primary = yield* physicalPrimary(database, tableName);
    // A table under another primary key is checked once it is recreated,
    // which only a wipe does; any other plan for it is refused before the
    // snapshot is written.
    if (samePrimary(primary, table.primary))
      yield* validateSQLiteTopology(database, table, tableName).pipe(
        Effect.mapError(failed),
      );
    const { contract, recreatedUnder, currentPrimary } = checkContract(
      database,
      tableName,
      primary,
    );
    yield* Migrations.sqlite({ database, tableName, contract });
    yield* checkTableSnapshot({
      contract,
      snapshot,
      mode,
      localIndexOrder: Object.keys(table.localSecondaryIndexes),
      hasRows: hasRows(database, tableName),
      wipe: (stored) =>
        wipeTable(database, table, tableName, stored).pipe(
          Effect.tap(() => Effect.sync(() => recreatedUnder(table.primary))),
        ),
      prepare: () =>
        samePrimary(currentPrimary(), table.primary)
          ? Effect.void
          : refuseOtherPrimary(tableName, currentPrimary(), table.primary),
    }).pipe(
      Effect.mapError((cause) =>
        cause instanceof ConditionFailure
          ? failed(
              new Error(
                `SQLite setup for table "${tableName}" kept racing another setup`,
              ),
            )
          : cause,
      ),
    );
    yield* reconcileSQLiteTable(database, table, tableName);
  });
