import { Context, Data, Effect, Exit } from "effect";
import type { Where } from "./helpers/index.js";

export type SqliteDBErrorType =
  | { _tag: "CreateTableFailed"; table: string; cause: unknown }
  | { _tag: "AddColumnFailed"; table: string; column: string; cause: unknown }
  | {
      _tag: "CreateIndexFailed";
      table: string;
      indexName: string;
      cause: unknown;
    }
  | { _tag: "InsertFailed"; table: string; cause: unknown }
  | { _tag: "UpdateFailed"; table: string; cause: unknown }
  | { _tag: "DeleteFailed"; table: string; cause: unknown }
  | { _tag: "GetFailed"; table: string; cause: unknown }
  | { _tag: "QueryFailed"; table: string; cause: unknown }
  | { _tag: "BeginFailed"; cause: unknown }
  | { _tag: "CommitFailed"; cause: unknown }
  | { _tag: "RollbackFailed"; cause: unknown };

export class SqliteDBError extends Data.TaggedError("SqliteDBError")<{
  error: SqliteDBErrorType;
}> {
  static createTableFailed(table: string, cause: unknown) {
    return new SqliteDBError({
      error: { _tag: "CreateTableFailed", table, cause },
    });
  }

  static addColumnFailed(table: string, column: string, cause: unknown) {
    return new SqliteDBError({
      error: { _tag: "AddColumnFailed", table, column, cause },
    });
  }

  static createIndexFailed(table: string, indexName: string, cause: unknown) {
    return new SqliteDBError({
      error: { _tag: "CreateIndexFailed", table, indexName, cause },
    });
  }

  static insertFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: "InsertFailed", table, cause } });
  }

  static updateFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: "UpdateFailed", table, cause } });
  }

  static deleteFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: "DeleteFailed", table, cause } });
  }

  static getFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: "GetFailed", table, cause } });
  }

  static queryFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: "QueryFailed", table, cause } });
  }

  static beginFailed(cause: unknown) {
    return new SqliteDBError({ error: { _tag: "BeginFailed", cause } });
  }

  static commitFailed(cause: unknown) {
    return new SqliteDBError({ error: { _tag: "CommitFailed", cause } });
  }

  static rollbackFailed(cause: unknown) {
    return new SqliteDBError({ error: { _tag: "RollbackFailed", cause } });
  }
}

export class SqliteDB extends Context.Tag("SqliteDB")<
  SqliteDB,
  {
    createTable(
      table: string,
      columns: string[],
      primaryKey: string[],
    ): Effect.Effect<void, SqliteDBError>;

    addColumn(
      table: string,
      column: string,
      type: string,
    ): Effect.Effect<void, SqliteDBError>;

    createIndex(
      table: string,
      indexName: string,
      columns: string[],
    ): Effect.Effect<void, SqliteDBError>;

    insert(
      table: string,
      values: Record<string, unknown>,
    ): Effect.Effect<{ rowsWritten: number }, SqliteDBError>;

    update(
      table: string,
      values: Record<string, unknown>,
      where: Where,
    ): Effect.Effect<{ rowsWritten: number }, SqliteDBError>;

    deleteAll(table: string): Effect.Effect<{ rowsDeleted: number }, SqliteDBError>;

    get<T extends Record<string, unknown>>(
      table: string,
      where: Where,
    ): Effect.Effect<T, SqliteDBError>;

    query<T extends Record<string, unknown>>(
      table: string,
      where: Where,
      options?: { orderBy?: "ASC" | "DESC"; orderByColumn?: string; limit?: number; offset?: number },
    ): Effect.Effect<T[], SqliteDBError>;

    begin(): Effect.Effect<void, SqliteDBError>;
    commit(): Effect.Effect<void, SqliteDBError>;
    rollback(): Effect.Effect<void, SqliteDBError>;
  }
>() {
  static transaction<A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | SqliteDBError, R | SqliteDB> {
    return Effect.acquireUseRelease(
      Effect.gen(function* () {
        const db = yield* SqliteDB;
        yield* db.begin();
        return db;
      }),
      () => effect,
      (db, exit) =>
        Exit.isSuccess(exit)
          ? db.commit().pipe(Effect.orDie)
          : db.rollback().pipe(Effect.orDie),
    );
  }
}
