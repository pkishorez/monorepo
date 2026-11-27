import BetterSqlite3 from 'better-sqlite3';
import type { SQLiteDriver } from '../database/index.js';
import { makeBetterSQLite3 } from '../drivers/better-sqlite3/index.js';
import {
  makeDurableObjectSQLite,
  type DurableObjectSQLiteStorage,
} from '../drivers/durable-object/index.js';
import { makeNodeSQLite } from '../drivers/node/index.js';

/** A Durable Object's `ctx.storage`, backed by a real SQLite database. */
export const fakeDurableObjectStorage = (
  database = new BetterSqlite3(':memory:'),
): DurableObjectSQLiteStorage => ({
  sql: {
    exec: (sql, ...parameters) => {
      const statement = database.prepare(sql);
      if (statement.reader) {
        const rows = statement.all(...parameters) as Record<string, unknown>[];
        return { toArray: () => rows, rowsWritten: 0 };
      }
      const { changes } = statement.run(...parameters);
      return { toArray: () => [], rowsWritten: changes };
    },
  },
  transactionSync: (callback) => database.transaction(callback)(),
});

/** The in-process drivers, each on a fresh in-memory database. */
export const inMemoryDrivers: readonly (readonly [
  string,
  () => SQLiteDriver,
])[] = [
  ['node', () => makeNodeSQLite({ path: ':memory:' })],
  ['better-sqlite3', () => makeBetterSQLite3({ path: ':memory:' })],
  [
    'durable-object',
    () => makeDurableObjectSQLite({ storage: fakeDurableObjectStorage() }),
  ],
];
