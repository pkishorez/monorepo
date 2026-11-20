import { Effect } from 'effect';
import { TableSnapshot } from '../../snapshot/index.js';
import {
  ConditionFailure,
  OperationFailure,
  type StdTableContract,
} from '../../db/std-table/contract/index.js';
import {
  readStoredSnapshot,
  writeTableSnapshot,
  type TableMode,
} from '../../db/table-snapshot/index.js';
import { LEGACY_CONTRACT_TABLE, LegacySQL } from './legacy.js';

type Value = string | number | null;

/** The part of a SQLite driver this migration uses. */
export interface LegacySQLiteDatabase {
  readonly run: (
    sql: string,
    parameters?: readonly Value[],
  ) => Effect.Effect<unknown, unknown>;
  readonly all: (
    sql: string,
    parameters?: readonly Value[],
  ) => Effect.Effect<readonly Readonly<Record<string, unknown>>[], unknown>;
}

export interface LegacySQLiteTarget {
  readonly database: LegacySQLiteDatabase;
  readonly tableName: string;
  /** The physical table, through the StdTable contract. */
  readonly contract: StdTableContract;
}

const failed = (cause: unknown) =>
  cause instanceof OperationFailure ? cause : new OperationFailure({ cause });

const legacyTableExists = (database: LegacySQLiteDatabase) =>
  database
    .all(LegacySQL.exists, [LEGACY_CONTRACT_TABLE])
    .pipe(Effect.map((rows) => rows.length > 0));

/**
 * Another setup, of this table or another in the same database, may drop
 * `_std_contract` between two statements here: a failure once it is gone
 * means there was nothing left to do.
 */
const whileLegacyExists = <A>(
  database: LegacySQLiteDatabase,
  effect: Effect.Effect<A, unknown>,
  gone: A,
) =>
  effect.pipe(
    Effect.catch((cause) =>
      legacyTableExists(database).pipe(
        Effect.flatMap((exists) =>
          exists ? Effect.fail(cause) : Effect.succeed(gone),
        ),
      ),
    ),
  );

/** Deletes the table's row, and `_std_contract` once no row is left. */
const removeRow = ({ database, tableName }: LegacySQLiteTarget) =>
  whileLegacyExists(
    database,
    Effect.gen(function* () {
      yield* database.run(LegacySQL.remove, [tableName]);
      const left = Number((yield* database.all(LegacySQL.count)).at(0)?.n);
      if (left === 0) yield* database.run(LegacySQL.drop);
    }),
    undefined,
  );

interface LegacyRecord {
  readonly snapshot: TableSnapshot;
  readonly mode: TableMode;
}

/** The row's snapshot and mode; `null` when it does not read. */
const readRow = (row: Readonly<Record<string, unknown>>) =>
  Effect.gen(function* () {
    const { mode, snapshot } = row;
    if (mode !== 'persistent' && mode !== 'disposable')
      return yield* Effect.fail(
        new Error(`its mode "${String(mode)}" is none`),
      );
    if (typeof snapshot !== 'string')
      return yield* Effect.fail(new Error('it holds no snapshot'));
    const document = yield* Effect.try(() => JSON.parse(snapshot) as unknown);
    const parsed = yield* TableSnapshot.parse(document);
    return { snapshot: parsed, mode } satisfies LegacyRecord;
  });

const migrateOnce = (target: LegacySQLiteTarget) =>
  Effect.gen(function* () {
    const { database, tableName, contract } = target;
    if (!(yield* legacyTableExists(database))) return;
    const stored = yield* readStoredSnapshot(contract);
    // Migrated already, perhaps by a run stopped before it cleaned up.
    if (stored.snapshot !== null) return yield* removeRow(target);
    const row = (yield* whileLegacyExists(
      database,
      database.all(LegacySQL.read, [tableName]),
      [],
    )).at(0);
    if (row === undefined) return;
    const record = yield* readRow(row).pipe(Effect.result);
    if (record._tag === 'Failure') {
      yield* Effect.logWarning(
        `std-toolkit: dropped the stored contract of SQLite table "${tableName}": ${record.failure.message}. Setup goes on as for a table with no snapshot.`,
      );
      return yield* removeRow(target);
    }
    // Only the items a stopped run did not write are written; `__snapshot`
    // goes last, so the row is kept until the snapshot is whole.
    yield* writeTableSnapshot(
      contract,
      stored,
      record.success.snapshot,
      record.success.mode,
    );
    yield* Effect.logInfo(
      `std-toolkit: moved the stored contract of SQLite table "${tableName}" into the table`,
    );
    yield* removeRow(target);
  });

const ATTEMPTS = 3;

/**
 * Moves a physical table's `_std_contract` row into its internal entities
 * (ADR 0020), then deletes the row, and `_std_contract` once it is empty. A
 * table that already has a `__snapshot` item only has a leftover row cleaned
 * up. A row that does not read is deleted with a warning. Idempotent; a run
 * stopped midway is completed by the next. When another setup records the
 * snapshot first, it starts over, and then only cleans up.
 */
export const migrateSQLite = (
  target: LegacySQLiteTarget,
): Effect.Effect<void, OperationFailure> =>
  Effect.gen(function* () {
    if (target.tableName.toLowerCase() === LEGACY_CONTRACT_TABLE)
      return yield* Effect.fail(
        failed(
          new Error(
            `SQLite table name "${LEGACY_CONTRACT_TABLE}" is reserved for the stored contract it once held`,
          ),
        ),
      );
    for (let attempt = 1; ; attempt++) {
      const result = yield* migrateOnce(target).pipe(Effect.result);
      if (result._tag === 'Success') return;
      if (!(result.failure instanceof ConditionFailure) || attempt === ATTEMPTS)
        return yield* Effect.fail(failed(result.failure));
    }
  });
