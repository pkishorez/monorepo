import type { SqlStorage } from '@cloudflare/workers-types';
import { Effect } from 'effect';
import type { SQLiteClient } from '../../../clients/sqlite-client/index.js';
import { makeSQLiteDatabaseLayer } from '../../../services/sqlite-database/index.js';

interface DurableObjectSqlStorage {
  exec<T extends Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): { toArray(): T[]; rowsWritten: number };
}

const makeDurableObjectSqliteClient = (input: SqlStorage): SQLiteClient => {
  const storage = input as unknown as DurableObjectSqlStorage;
  return {
    execute: (statement) =>
      Effect.try({
        try: () => {
          const result = storage.exec(statement.query, ...statement.params);
          return { rowsWritten: result.rowsWritten };
        },
        catch: (cause) => cause,
      }),
    query: <T extends Record<string, unknown>>(statement: {
      readonly query: string;
      readonly params: readonly unknown[];
    }) =>
      Effect.try({
        try: () =>
          storage.exec<T>(statement.query, ...statement.params).toArray(),
        catch: (cause) => cause,
      }),
    begin: () => Effect.try(() => void storage.exec('BEGIN')),
    commit: () => Effect.try(() => void storage.exec('COMMIT')),
    rollback: () => Effect.try(() => void storage.exec('ROLLBACK')),
  };
};

export const durableObjectSqliteLayer = (storage: SqlStorage) =>
  makeSQLiteDatabaseLayer(makeDurableObjectSqliteClient(storage));
