import { Effect, Layer } from 'effect';
import { SQLite } from '../../../db/sqlite/index.js';
import {
  makeExpoSQLite,
  type ExpoSQLiteDatabase,
} from '../../../db/sqlite/drivers/expo/index.js';
import { stdSyncName } from '../../domain/identity/index.js';
import { syncStore } from '../../domain/stored-entity/index.js';
import { noDoorbell, noLeadership, type SyncStore } from '../contract/index.js';

export type SqliteOptions = {
  /** An open expo-sqlite database. Every Std Sync keeps its own table in it. */
  readonly database: ExpoSQLiteDatabase;
  /** Names the table of a Std Sync. Default: `std-sync:<name>`. */
  readonly tableName?: (syncName: string) => string;
};

const PREFIX = 'std-sync:';
const defaultTableName = (syncName: string) => `${PREFIX}${syncName}`;

/**
 * SQLite storage for a native app, through expo-sqlite: one process runs
 * every Session, so there is no Leadership to share and no one to ring.
 */
const make = (options: SqliteOptions): SyncStore => {
  const database = makeExpoSQLite({ database: options.database });
  const tableName = options.tableName ?? defaultTableName;
  return {
    table: (syncName) => {
      const config = { database, tableName: tableName(syncName) };
      return Layer.unwrap(
        SQLite.setup(syncStore, config).pipe(
          Effect.as(SQLite.make(syncStore, config).layer),
          Effect.orDie,
        ),
      );
    },
    leadership: noLeadership,
    doorbell: noDoorbell,
  };
};

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/** Every Std Sync stored in this database under the default table name. */
const list = async (
  database: ExpoSQLiteDatabase,
): Promise<
  ReadonlyArray<{ readonly name: string; readonly tableName: string }>
> => {
  const tables = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, ?) = ? ORDER BY name",
    [PREFIX.length, PREFIX],
  );
  return tables.map(({ name }) => ({
    name: name.slice(PREFIX.length),
    tableName: name,
  }));
};

/**
 * Deletes a Std Sync's stored data, with its indexes. Dispose a live Std Sync
 * of that name first: without a Doorbell, nothing tells it to stop.
 */
const remove = async (
  database: ExpoSQLiteDatabase,
  name: string,
  options: Pick<SqliteOptions, 'tableName'> = {},
): Promise<void> => {
  const tableName = (options.tableName ?? defaultTableName)(stdSyncName(name));
  await database.runAsync(`DROP TABLE IF EXISTS ${quote(tableName)}`, []);
};

/** The Sync adapter for SQLite, with `list` and `remove` for what it keeps. */
export const sqlite = Object.assign(make, { list, remove });

export const Sync = { sqlite } as const;
