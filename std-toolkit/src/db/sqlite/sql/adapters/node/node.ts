import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { Effect } from 'effect';
import type { SQLiteClient } from '../../../clients/sqlite-client/index.js';
import { makeSQLiteDatabaseLayer } from '../../../services/sqlite-database/index.js';

const makeNodeSqliteClient = (db: DatabaseSync): SQLiteClient => ({
  execute: (statement) =>
    Effect.try({
      try: () => {
        const result = db
          .prepare(statement.query)
          .run(...(statement.params as SQLInputValue[]));
        return { rowsWritten: Number(result.changes) };
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
          .all(...(statement.params as SQLInputValue[])) as unknown as T[],
      catch: (cause) => cause,
    }),
  begin: () => Effect.try(() => void db.exec('BEGIN')),
  commit: () => Effect.try(() => void db.exec('COMMIT')),
  rollback: () => Effect.try(() => void db.exec('ROLLBACK')),
});

export const nodeSqliteLayer = (db: DatabaseSync) =>
  makeSQLiteDatabaseLayer(makeNodeSqliteClient(db));
