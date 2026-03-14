import type { Database, SQLQueryBindings } from "bun:sqlite";
import { Effect, Layer } from "effect";
import { SqliteDB, SqliteDBError } from "../db.js";
import * as Sql from "../helpers/index.js";
import type { Where } from "../helpers/index.js";

const params = (p: unknown[]) => p as SQLQueryBindings[];

export const SqliteDBBun = (db: Database) =>
  Layer.succeed(SqliteDB, {
    createTable: (table, columns, primaryKey) =>
      Effect.try({
        try: () => {
          const stmt = Sql.createTable(table, columns, primaryKey);
          db.prepare(stmt.query).run(...params(stmt.params));
        },
        catch: (cause) => SqliteDBError.createTableFailed(table, cause),
      }),

    addColumn: (table, column, type) =>
      Effect.try({
        try: () => {
          const info = Sql.tableInfo(table);
          const columns = db
            .prepare(info.query)
            .all(...params(info.params)) as Sql.TableColumn[];
          if (Sql.columnExists(columns, column)) return;
          const stmt = Sql.addColumn(table, column, type);
          db.prepare(stmt.query).run(...params(stmt.params));
        },
        catch: (cause) => SqliteDBError.addColumnFailed(table, column, cause),
      }),

    createIndex: (table, indexName, columns) =>
      Effect.try({
        try: () => {
          const stmt = Sql.createIndex(table, indexName, columns);
          db.prepare(stmt.query).run(...params(stmt.params));
        },
        catch: (cause) =>
          SqliteDBError.createIndexFailed(table, indexName, cause),
      }),

    insert: (table, values) =>
      Effect.try({
        try: () => {
          const stmt = Sql.insert(table, values);
          const result = db.prepare(stmt.query).run(...params(stmt.params));
          return { rowsWritten: result.changes };
        },
        catch: (cause) => SqliteDBError.insertFailed(table, cause),
      }),

    update: (table, values, where) =>
      Effect.try({
        try: () => {
          const stmt = Sql.update(table, values, where);
          const result = db.prepare(stmt.query).run(...params(stmt.params));
          return { rowsWritten: result.changes };
        },
        catch: (cause) => SqliteDBError.updateFailed(table, cause),
      }),

    deleteAll: (table) =>
      Effect.try({
        try: () => {
          const stmt = Sql.deleteAll(table);
          const result = db.prepare(stmt.query).run(...params(stmt.params));
          return { rowsDeleted: result.changes };
        },
        catch: (cause) => SqliteDBError.deleteFailed(table, cause),
      }),

    get: <T extends Record<string, unknown>>(table: string, where: Where) =>
      Effect.gen(function* () {
        const stmt = Sql.select(table, where, { limit: 1 });
        const rows = yield* Effect.try({
          try: () => db.prepare(stmt.query).all(...params(stmt.params)) as T[],
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
      options?: { orderBy?: "ASC" | "DESC"; orderByColumn?: string; limit?: number; offset?: number },
    ) =>
      Effect.try({
        try: () => {
          const stmt = Sql.select(table, where, options);
          return db.prepare(stmt.query).all(...params(stmt.params)) as T[];
        },
        catch: (cause) => SqliteDBError.queryFailed(table, cause),
      }),

    begin: () =>
      Effect.try({
        try: () => {
          const stmt = Sql.begin();
          db.prepare(stmt.query).run();
        },
        catch: (cause) => SqliteDBError.beginFailed(cause),
      }),

    commit: () =>
      Effect.try({
        try: () => {
          const stmt = Sql.commit();
          db.prepare(stmt.query).run();
        },
        catch: (cause) => SqliteDBError.commitFailed(cause),
      }),

    rollback: () =>
      Effect.try({
        try: () => {
          const stmt = Sql.rollback();
          db.prepare(stmt.query).run();
        },
        catch: (cause) => SqliteDBError.rollbackFailed(cause),
      }),
  });
