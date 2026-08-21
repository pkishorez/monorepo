import { Effect } from 'effect';
import type {
  SQLiteDriver,
  SQLiteRow,
  SQLiteValue,
} from '../../database/index.js';
import { SQLiteChangesMismatch } from '../../database/index.js';

// Wide enough that workerd's `SqlStorage` assigns structurally (its rows
// admit `ArrayBuffer`, ours don't); the driver narrows every row it returns.
export interface DurableObjectSqlCursor {
  readonly toArray: () => ReadonlyArray<Record<string, unknown>>;
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

const toSQLiteValue = (column: string, value: unknown): SQLiteValue => {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    value instanceof Uint8Array
  )
    return value;
  throw new Error(
    `Durable Object SQLite returned an unsupported value in column "${column}"`,
  );
};

const toSQLiteRow = (row: Record<string, unknown>): SQLiteRow =>
  Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      toSQLiteValue(column, value),
    ]),
  );

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
        try: () =>
          storage.sql
            .exec(sql, ...parameters)
            .toArray()
            .map(toSQLiteRow),
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
