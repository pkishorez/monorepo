import { DatabaseSync } from 'node:sqlite';
import { Effect } from 'effect';
import {
  SQLiteChangesMismatch,
  type SQLiteDriver,
  type SQLiteRow,
  type SQLiteValue,
} from '../../database/index.js';

export type NodeSQLiteConfig =
  | { readonly path: string; readonly database?: never }
  | { readonly database: DatabaseSync; readonly path?: never };

export type NodeSQLiteDriver = SQLiteDriver;

const rollback = (database: DatabaseSync) => {
  try {
    database.exec('ROLLBACK');
  } catch {
    return;
  }
};

export const makeNodeSQLite = (
  configuration: NodeSQLiteConfig,
): NodeSQLiteDriver => {
  const owned = configuration.database === undefined;
  const database =
    configuration.database ?? new DatabaseSync(configuration.path);
  const run = (sql: string, parameters: readonly SQLiteValue[] = []) =>
    Effect.try({
      try: () => ({
        changes: Number(database.prepare(sql).run(...parameters).changes),
      }),
      catch: (cause) => cause,
    });
  return {
    run,
    all: (sql, parameters = []) =>
      Effect.try({
        try: () => database.prepare(sql).all(...parameters) as SQLiteRow[],
        catch: (cause) => cause,
      }),
    transaction: (statements) =>
      Effect.try({
        try: () => {
          database.exec('BEGIN IMMEDIATE');
          try {
            for (const statement of statements) {
              const result = database
                .prepare(statement.sql)
                .run(...(statement.parameters ?? []));
              if (
                statement.expectedChanges !== undefined &&
                Number(result.changes) !== statement.expectedChanges
              )
                throw new SQLiteChangesMismatch();
            }
            database.exec('COMMIT');
          } catch (cause) {
            rollback(database);
            throw cause;
          }
        },
        catch: (cause) => cause,
      }),
    ...(owned ? { close: () => database.close() } : {}),
  };
};
