import { Effect } from 'effect';
import {
  SQLiteChangesMismatch,
  type SQLiteDriver,
  type SQLiteRow,
  type SQLiteValue,
} from '../../database/index.js';

interface D1Result {
  readonly results: Record<string, unknown>[];
}

interface D1Statement<Self> {
  readonly bind: (...values: (null | string | number | Uint8Array)[]) => Self;
  readonly all: () => Promise<D1Result>;
}

// Infer the binding's own statement type so native D1 bindings assign without
// requiring consumers to install a particular version of workers-types.
export interface D1SQLiteConfig<Statement extends D1Statement<Statement>> {
  readonly database: {
    readonly prepare: (sql: string) => Statement;
    readonly batch: (statements: Statement[]) => Promise<D1Result[]>;
  };
}

const bindValue = (value: SQLiteValue) => {
  if (typeof value === 'bigint')
    throw new TypeError('D1 SQLite does not support bigint parameters');
  return value;
};

const rowValue = (column: string, value: unknown): SQLiteValue => {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (
    Array.isArray(value) &&
    value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  )
    return new Uint8Array(value);
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Uint8Array
  )
    return value;
  throw new TypeError(
    `D1 SQLite returned an unsupported value in column "${column}"`,
  );
};

const sqliteRow = (row: Record<string, unknown>): SQLiteRow =>
  Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      rowValue(column, value),
    ]),
  );

export const makeD1SQLite = <Statement extends D1Statement<Statement>>(
  configuration: D1SQLiteConfig<Statement>,
): SQLiteDriver => {
  const database = configuration.database;
  const prepare = (sql: string, parameters: readonly SQLiteValue[] = []) => {
    const statement = database.prepare(sql);
    return parameters.length === 0
      ? statement
      : statement.bind(...parameters.map(bindValue));
  };

  return {
    run: (sql, parameters = []) =>
      Effect.tryPromise({
        try: async () => {
          // D1 meta.changes counts trigger writes too. Read SQLite changes() in
          // the same batch so the count belongs to this statement alone.
          const results = await database.batch([
            prepare(sql, parameters),
            prepare('SELECT changes() AS changes'),
          ]);
          const changes = results[1]?.results[0]?.changes;
          if (typeof changes !== 'number')
            throw new Error('D1 SQLite did not return changes()');
          return { changes };
        },
        catch: (cause) => cause,
      }),
    all: (sql, parameters = []) =>
      Effect.tryPromise({
        try: async () =>
          (await prepare(sql, parameters).all()).results.map(sqliteRow),
        catch: (cause) => cause,
      }),
    transaction: (statements) =>
      Effect.tryPromise({
        try: async () => {
          if (statements.length === 0) return;
          const assertions = new Map<string, number>();
          const batch: Statement[] = [];
          for (const [index, statement] of statements.entries()) {
            batch.push(prepare(statement.sql, statement.parameters));
            if (statement.expectedChanges === undefined) continue;
            const marker = `std_d1_changes_${crypto.randomUUID()}_${index}`;
            assertions.set(marker, index);
            // CASE evaluates only the selected branch. An invalid JSON path
            // raises a SQL error containing our marker, aborting the batch
            // before it can commit. A JS check after batch() would be too late.
            batch.push(
              prepare(
                "SELECT CASE WHEN changes() = ? THEN NULL ELSE json_extract('{}', ?) END",
                [statement.expectedChanges, marker],
              ),
            );
          }
          try {
            await database.batch(batch);
          } catch (cause) {
            if (cause instanceof Error) {
              for (const [marker, index] of assertions) {
                if (cause.message.includes(marker))
                  throw new SQLiteChangesMismatch(index);
              }
            }
            throw cause;
          }
        },
        catch: (cause) => cause,
      }),
  };
};
