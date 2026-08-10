import type { Effect } from 'effect';

export interface SQLiteStatement {
  readonly query: string;
  readonly params: readonly unknown[];
}

export interface SQLiteExecutionResult {
  readonly rowsWritten: number;
}

export interface SQLiteClient {
  readonly execute: (
    statement: SQLiteStatement,
  ) => Effect.Effect<SQLiteExecutionResult, unknown>;
  readonly query: <T extends Record<string, unknown>>(
    statement: SQLiteStatement,
  ) => Effect.Effect<T[], unknown>;
  readonly begin: () => Effect.Effect<void, unknown>;
  readonly commit: () => Effect.Effect<void, unknown>;
  readonly rollback: () => Effect.Effect<void, unknown>;
}
