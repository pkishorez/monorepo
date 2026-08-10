import type Database from 'better-sqlite3';
import { Effect } from 'effect';
import type { SQLiteClient } from '../../../clients/sqlite-client/index.js';
import { makeSQLiteDatabaseLayer } from '../../../services/sqlite-database/index.js';

const makeBetterSqlite3Client = (db: Database.Database): SQLiteClient => ({
  execute: (statement) =>
    Effect.try({
      try: () => {
        const result = db.prepare(statement.query).run(...statement.params);
        return { rowsWritten: result.changes };
      },
      catch: (cause) => cause,
    }),
  query: <T extends Record<string, unknown>>(statement: {
    readonly query: string;
    readonly params: readonly unknown[];
  }) =>
    Effect.try({
      try: () => db.prepare(statement.query).all(...statement.params) as T[],
      catch: (cause) => cause,
    }),
  begin: () => Effect.try(() => void db.exec('BEGIN')),
  commit: () => Effect.try(() => void db.exec('COMMIT')),
  rollback: () => Effect.try(() => void db.exec('ROLLBACK')),
});

export const betterSqlite3Layer = (db: Database.Database) =>
  makeSQLiteDatabaseLayer(makeBetterSqlite3Client(db));
