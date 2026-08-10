import type { Database, SQLQueryBindings } from 'bun:sqlite';
import { Effect } from 'effect';
import type { SQLiteClient } from '../../../clients/sqlite-client/index.js';
import { makeSQLiteDatabaseLayer } from '../../../services/sqlite-database/index.js';

const makeBunSqliteClient = (db: Database): SQLiteClient => ({
  execute: (statement) =>
    Effect.try({
      try: () => {
        const result = db
          .prepare(statement.query)
          .run(...(statement.params as SQLQueryBindings[]));
        return { rowsWritten: result.changes };
      },
      catch: (cause) => cause,
    }),
  query: <T extends Record<string, unknown>>(statement: {
    readonly query: string;
    readonly params: readonly unknown[];
  }) =>
    Effect.try({
      try: () =>
        db
          .prepare(statement.query)
          .all(...(statement.params as SQLQueryBindings[])) as unknown as T[],
      catch: (cause) => cause,
    }),
  begin: () => Effect.try(() => void db.exec('BEGIN')),
  commit: () => Effect.try(() => void db.exec('COMMIT')),
  rollback: () => Effect.try(() => void db.exec('ROLLBACK')),
});

export const bunSqliteLayer = (db: Database) =>
  makeSQLiteDatabaseLayer(makeBunSqliteClient(db));
