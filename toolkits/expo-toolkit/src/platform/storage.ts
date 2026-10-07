import { Effect } from 'effect';
import {
  openDatabaseSync,
  type SQLiteBindValue,
  type SQLiteDatabase,
} from 'expo-sqlite';
import { SQLite, type SQLiteDriver } from '@kstackz/std-toolkit/db/sqlite';
import { makeExpoSQLite } from '@kstackz/std-toolkit/db/sqlite/expo';
import {
  deleteStdSync,
  expo,
  listStdSyncs,
} from '@kstackz/std-toolkit/sync/platform/expo';
import type { TableSource } from '@kstackz/auth-toolkit/app';

// One SQLite file per database, as the web keeps one IndexedDB database
// each, and one more for Std Sync.
const open = (name: string): SQLiteDatabase => {
  const database = openDatabaseSync(`${name}.db`);
  database.execSync('PRAGMA journal_mode = WAL');
  // Guarded writes run on a second connection (std-toolkit's Expo driver);
  // a write here waits for its lock instead of failing "database is locked".
  database.execSync('PRAGMA busy_timeout = 5000');
  return database;
};

// A row as setup reads it: table and index details.
type SQLiteRow = Readonly<Record<string, string | number | null>>;

// expo-sqlite's synchronous calls, for setting a table up: std-toolkit's
// Expo driver is async, and setup only creates tables and indexes.
const setupDriver = (database: SQLiteDatabase): SQLiteDriver => ({
  run: (sql, parameters = []) =>
    Effect.try(() => ({
      changes: database.runSync(sql, parameters as SQLiteBindValue[]).changes,
    })),
  all: (sql, parameters = []) =>
    Effect.try(() =>
      database.getAllSync<SQLiteRow>(sql, parameters as SQLiteBindValue[]),
    ),
  transaction: (statements) =>
    Effect.try(() =>
      database.withTransactionSync(() => {
        for (const { sql, parameters = [] } of statements)
          database.runSync(sql, parameters as SQLiteBindValue[]);
      }),
    ),
});

/**
 * Where this phone keeps things: each table in its database's SQLite file,
 * opened on first use and set up once, and Std Sync in `copies.db`, each
 * sync in a table of its own.
 */
export const makeStorage = () => {
  const databases = new Map<string, SQLiteDatabase>();
  const database = (name: string) => {
    const opened = databases.get(name) ?? open(name);
    databases.set(name, opened);
    return opened;
  };
  const copies = open('copies');

  // Each table is set up once per launch, the first time it is asked for,
  // and synchronously: Layers are built with `runSync`, as IndexedDB's open
  // on the web allows.
  const ready = new Set<string>();
  const table = <Name extends string>(
    source: TableSource<Name>,
    name: string,
  ) => {
    const opened = database(name);
    const key = `${name}/${source.logicalName}`;
    if (!ready.has(key)) {
      Effect.runSync(SQLite.setup(source, { database: setupDriver(opened) }));
      ready.add(key);
    }
    return SQLite.make(source, {
      database: makeExpoSQLite({ database: opened }),
    }).layer;
  };

  return {
    table,
    sync: {
      ...expo({ database: copies }),
      list: () => listStdSyncs(copies),
      remove: (name: string) => deleteStdSync(copies, name),
    },
  };
};
