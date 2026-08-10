import { Context, Effect, Layer } from 'effect';
import type { SQLiteClient } from '../../clients/sqlite-client/index.js';
import {
  SQL as Sql,
  type TableColumn,
  type Where,
} from '../../domain/sql-statement/index.js';
import {
  SQLiteError,
  type SQLiteErrorType,
} from '../../domain/sqlite-error/index.js';

interface SQLiteDatabaseService {
  readonly createTable: (
    table: string,
    columns: string[],
    primaryKey: string[],
  ) => Effect.Effect<void, SQLiteErrorType>;
  readonly addColumn: (
    table: string,
    column: string,
    type: string,
  ) => Effect.Effect<void, SQLiteErrorType>;
  readonly createIndex: (
    table: string,
    indexName: string,
    columns: string[],
  ) => Effect.Effect<void, SQLiteErrorType>;
  readonly insert: (
    table: string,
    values: Record<string, unknown>,
  ) => Effect.Effect<{ rowsWritten: number }, SQLiteErrorType>;
  readonly update: (
    table: string,
    values: Record<string, unknown>,
    where: Where,
  ) => Effect.Effect<{ rowsWritten: number }, SQLiteErrorType>;
  readonly delete: (
    table: string,
    where: Where,
  ) => Effect.Effect<{ rowsDeleted: number }, SQLiteErrorType>;
  readonly deleteAll: (
    table: string,
  ) => Effect.Effect<{ rowsDeleted: number }, SQLiteErrorType>;
  readonly get: <T extends Record<string, unknown>>(
    table: string,
    where: Where,
  ) => Effect.Effect<T, SQLiteErrorType>;
  readonly query: <T extends Record<string, unknown>>(
    table: string,
    where: Where,
    options?: {
      orderBy?: 'ASC' | 'DESC';
      orderByColumn?: string;
      limit?: number;
      offset?: number;
    },
  ) => Effect.Effect<T[], SQLiteErrorType>;
  readonly begin: () => Effect.Effect<void, SQLiteErrorType>;
  readonly commit: () => Effect.Effect<void, SQLiteErrorType>;
  readonly rollback: () => Effect.Effect<void, SQLiteErrorType>;
}

export class SQLiteDatabase extends Context.Service<
  SQLiteDatabase,
  SQLiteDatabaseService
>()('std-toolkit/SQLiteDatabase') {}

export const makeSQLiteDatabaseLayer = (
  client: SQLiteClient,
): Layer.Layer<SQLiteDatabase> =>
  Layer.succeed(SQLiteDatabase, {
    createTable: (table, columns, primaryKey) =>
      client.execute(Sql.createTable(table, columns, primaryKey)).pipe(
        Effect.asVoid,
        Effect.mapError((cause) => SQLiteError.createTableFailed(table, cause)),
      ),
    addColumn: (table, column, type) =>
      client.query<TableColumn>(Sql.tableInfo(table)).pipe(
        Effect.flatMap((columns) =>
          Sql.columnExists(columns, column)
            ? Effect.void
            : client
                .execute(Sql.addColumn(table, column, type))
                .pipe(Effect.asVoid),
        ),
        Effect.mapError((cause) =>
          SQLiteError.addColumnFailed(table, column, cause),
        ),
      ),
    createIndex: (table, indexName, columns) =>
      client.execute(Sql.createIndex(table, indexName, columns)).pipe(
        Effect.asVoid,
        Effect.mapError((cause) =>
          SQLiteError.createIndexFailed(table, indexName, cause),
        ),
      ),
    insert: (table, values) =>
      client
        .execute(Sql.insert(table, values))
        .pipe(
          Effect.mapError((cause) => SQLiteError.insertFailed(table, cause)),
        ),
    update: (table, values, where) =>
      client
        .execute(Sql.update(table, values, where))
        .pipe(
          Effect.mapError((cause) => SQLiteError.updateFailed(table, cause)),
        ),
    delete: (table, where) =>
      client.execute(Sql.delete(table, where)).pipe(
        Effect.map(({ rowsWritten }) => ({ rowsDeleted: rowsWritten })),
        Effect.mapError((cause) => SQLiteError.deleteFailed(table, cause)),
      ),
    deleteAll: (table) =>
      client.execute(Sql.deleteAll(table)).pipe(
        Effect.map(({ rowsWritten }) => ({ rowsDeleted: rowsWritten })),
        Effect.mapError((cause) => SQLiteError.deleteFailed(table, cause)),
      ),
    get: <T extends Record<string, unknown>>(table: string, where: Where) =>
      client.query<T>(Sql.select(table, where, { limit: 1 })).pipe(
        Effect.matchEffect({
          onFailure: (cause) =>
            Effect.fail(SQLiteError.getFailed(table, cause)),
          onSuccess: (rows) =>
            rows[0] === undefined
              ? Effect.fail(SQLiteError.getFailed(table, 'Item not found'))
              : Effect.succeed(rows[0]),
        }),
      ),
    query: <T extends Record<string, unknown>>(
      table: string,
      where: Where,
      options?: {
        orderBy?: 'ASC' | 'DESC';
        orderByColumn?: string;
        limit?: number;
        offset?: number;
      },
    ) =>
      client
        .query<T>(Sql.select(table, where, options))
        .pipe(
          Effect.mapError((cause) => SQLiteError.queryFailed(table, cause)),
        ),
    begin: () => client.begin().pipe(Effect.mapError(SQLiteError.beginFailed)),
    commit: () =>
      client.commit().pipe(Effect.mapError(SQLiteError.commitFailed)),
    rollback: () =>
      client.rollback().pipe(Effect.mapError(SQLiteError.rollbackFailed)),
  });
