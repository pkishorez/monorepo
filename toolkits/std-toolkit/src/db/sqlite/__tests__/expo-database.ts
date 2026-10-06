import { DatabaseSync } from 'node:sqlite';
import type { ExpoSQLiteDatabase } from '../drivers/expo/index.js';

/**
 * expo-sqlite's async API over an in-memory `node:sqlite` database. The
 * exclusive transaction runs on the same connection, where expo-sqlite opens
 * a second one; with one caller at a time the effect is the same.
 */
export const fakeExpoDatabase = (database = new DatabaseSync(':memory:')) => {
  const queries = {
    runAsync: async (source: string, params: unknown[]) => {
      const result = database
        .prepare(source)
        .run(...(params as (string | number | null | Uint8Array)[]));
      return { changes: Number(result.changes) };
    },
    getAllAsync: async <T>(source: string, params: unknown[]) =>
      database
        .prepare(source)
        .all(...(params as (string | number | null | Uint8Array)[])) as T[],
  };
  const expo: ExpoSQLiteDatabase = {
    ...queries,
    withExclusiveTransactionAsync: async (task) => {
      database.exec('BEGIN EXCLUSIVE');
      try {
        await task(queries);
        database.exec('COMMIT');
      } catch (cause) {
        database.exec('ROLLBACK');
        throw cause;
      }
    },
  };
  return Object.assign(expo, { close: () => database.close() });
};
