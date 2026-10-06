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
import type { DeviceDatabase, TableSource } from '@ledger/core/client/platform';

// One SQLite file per database, as the web keeps one IndexedDB database
// each: the device's own, the Local Backend's money, and Remote copies.
const open = (name: string): SQLiteDatabase => {
  const database = openDatabaseSync(`${name}.db`);
  database.execSync('PRAGMA journal_mode = WAL');
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
 * made once and set up on first use, and each Remote Session's copy in a
 * table of its own in `copies.db`.
 */
export const makeStorage = () => {
  const databases = {
    device: open('device'),
    'local-backend': open('local-backend'),
  } satisfies Record<DeviceDatabase, SQLiteDatabase>;
  const copies = open('copies');

  // Each table is set up once per launch, the first time it is asked for,
  // and synchronously: core builds its Layers with `runSync`, as IndexedDB's
  // open on the web allows.
  const ready = new Set<string>();
  const table = <Name extends string>(
    source: TableSource<Name>,
    database: DeviceDatabase,
  ) => {
    const opened = databases[database];
    const key = `${database}/${source.logicalName}`;
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
    copies: expo({ database: copies }),
    listCopies: () => listStdSyncs(copies),
    deleteCopy: (name: string) => deleteStdSync(copies, name),
  };
};
