import { Effect, Layer } from "effect";
import { SqliteDB, SqliteDBError } from "../db.js";
import * as Sql from "../helpers";
import type { Where } from "../helpers/index.js";
import { SqlStorage } from "@cloudflare/workers-types";

interface DOSqlStorage {
  exec<T extends Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): { toArray(): T[]; rowsWritten: number };
}

export const SqliteDBDO = (storage_: SqlStorage) => {
  const storage: DOSqlStorage = storage_ as unknown as DOSqlStorage;
  return Layer.succeed(SqliteDB, {
    createTable: (table, columns, primaryKey) =>
      Effect.try({
        try: () => {
          const stmt = Sql.createTable(table, columns, primaryKey);
          storage.exec(stmt.query, ...stmt.params);
        },
        catch: (cause) => SqliteDBError.createTableFailed(table, cause),
      }),

    addColumn: (table, column, type) =>
      Effect.try({
        try: () => {
          const info = Sql.tableInfo(table);
          const columns = storage
            .exec<Sql.TableColumn>(info.query, ...info.params)
            .toArray();
          if (Sql.columnExists(columns, column)) return;
          const stmt = Sql.addColumn(table, column, type);
          storage.exec(stmt.query, ...stmt.params);
        },
        catch: (cause) => SqliteDBError.addColumnFailed(table, column, cause),
      }),

    createIndex: (table, indexName, columns) =>
      Effect.try({
        try: () => {
          const stmt = Sql.createIndex(table, indexName, columns);
          storage.exec(stmt.query, ...stmt.params);
        },
        catch: (cause) =>
          SqliteDBError.createIndexFailed(table, indexName, cause),
      }),

    insert: (table, values) =>
      Effect.try({
        try: () => {
          const stmt = Sql.insert(table, values);
          const result = storage.exec(stmt.query, ...stmt.params);
          return { rowsWritten: result.rowsWritten };
        },
        catch: (cause) => SqliteDBError.insertFailed(table, cause),
      }),

    update: (table, values, where) =>
      Effect.try({
        try: () => {
          const stmt = Sql.update(table, values, where);
          const result = storage.exec(stmt.query, ...stmt.params);
          return { rowsWritten: result.rowsWritten };
        },
        catch: (cause) => SqliteDBError.updateFailed(table, cause),
      }),

    deleteAll: (table) =>
      Effect.try({
        try: () => {
          const stmt = Sql.deleteAll(table);
          const result = storage.exec(stmt.query, ...stmt.params);
          return { rowsDeleted: result.rowsWritten };
        },
        catch: (cause) => SqliteDBError.deleteFailed(table, cause),
      }),

    get: <T extends Record<string, unknown>>(table: string, where: Where) =>
      Effect.gen(function* () {
        const stmt = Sql.select(table, where, { limit: 1 });
        const rows = yield* Effect.try({
          try: () => storage.exec<T>(stmt.query, ...stmt.params).toArray(),
          catch: (cause) => SqliteDBError.getFailed(table, cause),
        });
        if (rows.length === 0) {
          return yield* Effect.fail(
            SqliteDBError.getFailed(table, "Item not found"),
          );
        }
        return rows[0]!;
      }),

    query: <T extends Record<string, unknown>>(
      table: string,
      where: Where,
      options?: { orderBy?: "ASC" | "DESC"; limit?: number; offset?: number },
    ) =>
      Effect.try({
        try: () => {
          const stmt = Sql.select(table, where, options);
          return storage.exec<T>(stmt.query, ...stmt.params).toArray();
        },
        catch: (cause) => SqliteDBError.queryFailed(table, cause),
      }),

    begin: () =>
      Effect.try({
        try: () => {
          const stmt = Sql.begin();
          storage.exec(stmt.query, ...stmt.params);
        },
        catch: (cause) => SqliteDBError.beginFailed(cause),
      }),

    commit: () =>
      Effect.try({
        try: () => {
          const stmt = Sql.commit();
          storage.exec(stmt.query, ...stmt.params);
        },
        catch: (cause) => SqliteDBError.commitFailed(cause),
      }),

    rollback: () =>
      Effect.try({
        try: () => {
          const stmt = Sql.rollback();
          storage.exec(stmt.query, ...stmt.params);
        },
        catch: (cause) => SqliteDBError.rollbackFailed(cause),
      }),
  });
};
