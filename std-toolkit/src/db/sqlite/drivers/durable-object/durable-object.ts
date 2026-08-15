import { Effect } from 'effect';
import type {
  SQLiteDriver,
  SQLiteRow,
  SQLiteValue,
} from '../../database/index.js';
import { SQLiteChangesMismatch } from '../../database/index.js';

export interface DurableObjectSqlCursor {
  readonly toArray: () => SQLiteRow[];
  readonly rowsWritten: number;
}

export interface DurableObjectSqlStorage {
  readonly exec: (
    sql: string,
    ...parameters: readonly SQLiteValue[]
  ) => DurableObjectSqlCursor;
}

export interface DurableObjectSQLiteStorage {
  readonly sql: DurableObjectSqlStorage;
  readonly transactionSync: <A>(callback: () => A) => A;
}

export interface DurableObjectSQLiteConfig {
  readonly storage: DurableObjectSQLiteStorage;
}

export type DurableObjectSQLiteDriver = SQLiteDriver;

export const makeDurableObjectSQLite = (
  configuration: DurableObjectSQLiteConfig,
): DurableObjectSQLiteDriver => {
  const storage = configuration.storage;
  const execute = (sql: string, parameters: readonly SQLiteValue[] = []) => {
    storage.sql.exec(sql, ...parameters);
    const changes = storage.sql
      .exec('SELECT changes() AS changes')
      .toArray()[0]?.changes;
    if (typeof changes !== 'number' && typeof changes !== 'bigint')
      throw new Error('Durable Object SQLite did not return changes()');
    return { changes: Number(changes) };
  };
  const run = (sql: string, parameters: readonly SQLiteValue[] = []) =>
    Effect.try({
      try: () => execute(sql, parameters),
      catch: (cause) => cause,
    });
  return {
    run,
    all: (sql, parameters = []) =>
      Effect.try({
        try: () => storage.sql.exec(sql, ...parameters).toArray(),
        catch: (cause) => cause,
      }),
    transaction: (statements) =>
      Effect.try({
        try: () =>
          storage.transactionSync(() => {
            for (const [index, statement] of statements.entries()) {
              const result = execute(statement.sql, statement.parameters);
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
