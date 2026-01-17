import { Effect, Layer } from "effect";
import { SqliteDB, SqliteDBError } from "../db.js";
import * as Ops from "../helpers/operations.js";
import * as Schema from "../helpers/schema.js";
import type { Where } from "../helpers/index.js";

interface DOSqlStorage {
  exec<T extends Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): { toArray(): T[]; rowsWritten: number };
}

export const SqliteDBDO = (storage: DOSqlStorage) =>
  Layer.succeed(SqliteDB, {
    createTable: (table, columns, primaryKey) =>
      Effect.try({
        try: () => {
          const stmt = Schema.createTable(table, columns, primaryKey);
          storage.exec(stmt.query, ...stmt.params);
        },
        catch: (cause) => SqliteDBError.createTableFailed(table, cause),
      }),

    addColumn: (table, column, type) =>
      Effect.try({
        try: () => {
          const stmt = Schema.addColumn(table, column, type);
          storage.exec(stmt.query, ...stmt.params);
        },
        catch: (cause) => SqliteDBError.addColumnFailed(table, column, cause),
      }),

    createIndex: (table, indexName, columns) =>
      Effect.try({
        try: () => {
          const stmt = Schema.createIndex(table, indexName, columns);
          storage.exec(stmt.query, ...stmt.params);
        },
        catch: (cause) => SqliteDBError.createIndexFailed(table, indexName, cause),
      }),

    insert: (table, values) =>
      Effect.try({
        try: () => {
          const stmt = Ops.insert(table, values);
          const result = storage.exec(stmt.query, ...stmt.params);
          return { rowsWritten: result.rowsWritten };
        },
        catch: (cause) => SqliteDBError.insertFailed(table, cause),
      }),

    update: (table, values, where) =>
      Effect.try({
        try: () => {
          const stmt = Ops.update(table, values, where);
          const result = storage.exec(stmt.query, ...stmt.params);
          return { rowsWritten: result.rowsWritten };
        },
        catch: (cause) => SqliteDBError.updateFailed(table, cause),
      }),

    query: <T>(table: string, where: Where, options?: { orderBy?: "ASC" | "DESC"; limit?: number; offset?: number }) =>
      Effect.try({
        try: () => {
          const stmt = Ops.select(table, where, options);
          return storage.exec<T>(stmt.query, ...stmt.params).toArray();
        },
        catch: (cause) => SqliteDBError.queryFailed(table, cause),
      }),
  });
