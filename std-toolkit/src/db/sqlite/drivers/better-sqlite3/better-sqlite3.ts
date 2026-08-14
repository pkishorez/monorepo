import BetterSqlite3 from 'better-sqlite3';
import { Effect } from 'effect';
import {
  SQLiteChangesMismatch,
  type SQLiteDriver,
  type SQLiteRow,
} from '../../database/index.js';

export type BetterSQLite3Config =
  | { readonly path: string; readonly database?: never }
  | { readonly database: BetterSqlite3.Database; readonly path?: never };

export type BetterSQLite3Driver = SQLiteDriver;

export const makeBetterSQLite3 = (
  configuration: BetterSQLite3Config,
): BetterSQLite3Driver => {
  const owned = configuration.database === undefined;
  const database =
    configuration.database ?? new BetterSqlite3(configuration.path);
  return {
    run: (sql, parameters = []) =>
      Effect.try({
        try: () => ({
          changes: database.prepare(sql).run(...parameters).changes,
        }),
        catch: (cause) => cause,
      }),
    all: (sql, parameters = []) =>
      Effect.try({
        try: () => database.prepare(sql).all(...parameters) as SQLiteRow[],
        catch: (cause) => cause,
      }),
    transaction: (statements) =>
      Effect.try({
        try: () =>
          database.transaction(() => {
            for (const statement of statements) {
              const result = database
                .prepare(statement.sql)
                .run(...(statement.parameters ?? []));
              if (
                statement.expectedChanges !== undefined &&
                result.changes !== statement.expectedChanges
              )
                throw new SQLiteChangesMismatch();
            }
          })(),
        catch: (cause) => cause,
      }),
    ...(owned ? { close: () => database.close() } : {}),
  };
};
