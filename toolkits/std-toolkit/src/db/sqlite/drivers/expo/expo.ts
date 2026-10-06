import { Effect } from 'effect';
import {
  SQLiteChangesMismatch,
  type SQLiteDriver,
  type SQLiteRow,
  type SQLiteValue,
} from '../../database/index.js';

type ExpoBindValue = string | number | null | Uint8Array;

interface ExpoSQLiteQueries {
  runAsync(
    source: string,
    params: ExpoBindValue[],
  ): Promise<{ readonly changes: number }>;
  getAllAsync<T>(source: string, params: ExpoBindValue[]): Promise<T[]>;
}

/**
 * The part of expo-sqlite's `SQLiteDatabase` the driver uses, so a database
 * from `openDatabaseAsync` assigns without this package importing expo-sqlite.
 */
export interface ExpoSQLiteDatabase extends ExpoSQLiteQueries {
  withExclusiveTransactionAsync(
    task: (transaction: ExpoSQLiteQueries) => Promise<void>,
  ): Promise<void>;
}

export interface ExpoSQLiteConfig {
  /** An open expo-sqlite database. The caller owns it and closes it. */
  readonly database: ExpoSQLiteDatabase;
}

const bindValues = (parameters: readonly SQLiteValue[]) =>
  parameters.map((value) => {
    if (typeof value === 'bigint')
      throw new TypeError('Expo SQLite does not support bigint parameters');
    return value;
  });

/** A driver over expo-sqlite's async API. Guarded writes share one exclusive transaction. */
export const makeExpoSQLite = (
  configuration: ExpoSQLiteConfig,
): SQLiteDriver => {
  const database = configuration.database;
  return {
    run: (sql, parameters = []) =>
      Effect.tryPromise({
        try: async () => ({
          changes: (await database.runAsync(sql, bindValues(parameters)))
            .changes,
        }),
        catch: (cause) => cause,
      }),
    all: (sql, parameters = []) =>
      Effect.tryPromise({
        try: () => database.getAllAsync<SQLiteRow>(sql, bindValues(parameters)),
        catch: (cause) => cause,
      }),
    transaction: (statements) =>
      Effect.tryPromise({
        // expo-sqlite rolls back when the task rejects. The exclusive variant
        // runs on its own connection, so no other query interleaves.
        try: () =>
          database.withExclusiveTransactionAsync(async (transaction) => {
            for (const [index, statement] of statements.entries()) {
              const result = await transaction.runAsync(
                statement.sql,
                bindValues(statement.parameters ?? []),
              );
              if (
                statement.expectedChanges !== undefined &&
                result.changes !== statement.expectedChanges
              )
                throw new SQLiteChangesMismatch(index);
            }
          }),
        catch: (cause) => cause,
      }),
  };
};
