import { Effect } from 'effect';
import type {
  OperationFailure,
  StdTableContract,
} from '../db/std-table/contract/index.js';
import { migrateIDB, migrateSQLite } from './2026-11-stored-contract/index.js';

/*
 * Moves data from a layout std-toolkit no longer writes to the one it does
 * (ADR 0020). Each migration is a folder named after the release it ships in,
 * and imports nothing that may change. The rest of the toolkit calls only the
 * entry points below, which stay, doing nothing, when no migration is
 * registered. Deleting a migration is deleting its folder and its line here.
 */

type SQLiteValue = string | number | bigint | Uint8Array | null;

/** A SQLite physical table, as setup holds it before the check. */
export interface SQLiteMigrationTarget {
  readonly database: {
    readonly run: (
      sql: string,
      parameters?: readonly SQLiteValue[],
    ) => Effect.Effect<unknown, unknown>;
    readonly all: (
      sql: string,
      parameters?: readonly SQLiteValue[],
    ) => Effect.Effect<readonly Readonly<Record<string, unknown>>[], unknown>;
  };
  /** The physical table's name in the database. */
  readonly tableName: string;
  /** The physical table, through the StdTable contract. It exists already. */
  readonly contract: StdTableContract;
}

/** An IndexedDB table store, as setup holds it before its first version change. */
export interface IDBMigrationTarget {
  /** The table store's name in the database. */
  readonly storeName: string;
}

/** A version change a migration needs of an IndexedDB database. */
export interface IDBMigrationUpgrade {
  /** Whether the open database still needs it. */
  readonly needed: (database: IDBDatabase) => boolean;
  /** Makes it, inside the version change. */
  readonly apply: (database: IDBDatabase, transaction: IDBTransaction) => void;
}

type Migration<Target> = (
  target: Target,
) => Effect.Effect<void, OperationFailure>;

type IDBMigration = (
  target: IDBMigrationTarget,
) => Effect.Effect<readonly IDBMigrationUpgrade[], OperationFailure>;

const sqlite: readonly Migration<SQLiteMigrationTarget>[] = [migrateSQLite];

const idb: readonly IDBMigration[] = [migrateIDB];

const runAll =
  <Target>(migrations: readonly Migration<Target>[]) =>
  (target: Target): Effect.Effect<void, OperationFailure> =>
    Effect.forEach(migrations, (migrate) => migrate(target), {
      discard: true,
    });

export const Migrations = {
  /**
   * Runs once per SQLite setup, after the physical table exists and before
   * the snapshot check, so the check compares against what was moved.
   */
  sqlite: runAll(sqlite),
  /**
   * Runs once per IndexedDB setup, before it changes the database, and
   * returns the version changes the migrations need. Setup makes them in the
   * same upgrade that creates its store, before the snapshot check. Fails for
   * a store name a migration reserves.
   */
  idb: (
    target: IDBMigrationTarget,
  ): Effect.Effect<readonly IDBMigrationUpgrade[], OperationFailure> =>
    Effect.forEach(idb, (migrate) => migrate(target)).pipe(
      Effect.map((upgrades) => upgrades.flat()),
    ),
  // The Alchemy providers' entry point is `AlchemyMigrations`, in
  // `./alchemy`, so the runtime never loads Alchemy.
} as const;
