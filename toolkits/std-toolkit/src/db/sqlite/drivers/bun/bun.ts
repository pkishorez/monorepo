import { Effect } from 'effect';
import type {
  SQLiteDriver,
  SQLiteRow,
  SQLiteValue,
} from '../../database/index.js';
import { SQLiteChangesMismatch } from '../../database/index.js';

export interface BunSQLiteConfig {
  readonly database: BunSQLiteDatabase;
}

export interface BunSQLiteQuery {
  readonly run: (...parameters: readonly SQLiteValue[]) => {
    readonly changes: number | bigint;
  };
  readonly all: (...parameters: readonly SQLiteValue[]) => SQLiteRow[];
}

export interface BunSQLiteDatabase {
  readonly query: (sql: string) => BunSQLiteQuery;
  readonly transaction: <A>(body: () => A) => () => A;
}

export type BunSQLiteDriver = SQLiteDriver;

export const makeBunSQLite = (
  configuration: BunSQLiteConfig,
): BunSQLiteDriver => {
  const database = configuration.database;
  return {
    run: (sql, parameters = []) =>
      Effect.try({
        try: () => ({
          changes: Number(database.query(sql).run(...parameters).changes),
        }),
        catch: (cause) => cause,
      }),
    all: (sql, parameters = []) =>
      Effect.try({
        try: () => database.query(sql).all(...parameters) as SQLiteRow[],
        catch: (cause) => cause,
      }),
    transaction: (statements) =>
      Effect.try({
        try: () =>
          database.transaction(() => {
            for (const [index, statement] of statements.entries()) {
              const result = database
                .query(statement.sql)
                .run(...(statement.parameters ?? []));
              if (
                statement.expectedChanges !== undefined &&
                Number(result.changes) !== statement.expectedChanges
              )
                throw new SQLiteChangesMismatch(index);
            }
          })(),
        catch: (cause) => cause,
      }),
  };
};
