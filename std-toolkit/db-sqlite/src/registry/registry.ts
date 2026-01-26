import { Effect } from "effect";
import type { SQLiteTable } from "../table/table.js";
import type { DatabaseSchema } from "../table/types.js";
import { SqliteDB, SqliteDBError } from "../sql/db.js";

// Extract table name from SQLiteTable
type TableName<T> = T extends SQLiteTable<infer S, any, any, any> ? S["name"] : never;

// Tables map type
type TablesMap = Record<string, SQLiteTable<any, any, any, any>>;

export class DatabaseRegistry<TTables extends TablesMap> {
  static make() {
    return new DatabaseRegistryBuilder<{}>({});
  }

  #tables: TTables;

  constructor(tables: TTables) {
    this.#tables = tables;
  }

  /** Type-safe table access */
  table<K extends keyof TTables>(name: K): TTables[K] {
    return this.#tables[name];
  }

  /** Get all registered table names */
  get tableNames(): (keyof TTables)[] {
    return Object.keys(this.#tables) as (keyof TTables)[];
  }

  /** Setup all registered tables */
  setup(): Effect.Effect<void, SqliteDBError, SqliteDB> {
    return Effect.all(
      Object.values(this.#tables).map((t) => t.setup()),
      { concurrency: 1 },
    ).pipe(Effect.asVoid);
  }

  /** Type-safe transaction wrapper */
  transaction<A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | SqliteDBError, R | SqliteDB> {
    return SqliteDB.transaction(effect);
  }

  /** Aggregated schema for all tables */
  getSchema(): DatabaseSchema {
    return {
      tables: Object.values(this.#tables).map((t) => t.getDescriptor()),
    };
  }
}

class DatabaseRegistryBuilder<TTables extends TablesMap> {
  #tables: TTables;

  constructor(tables: TTables) {
    this.#tables = tables;
  }

  register<TTable extends SQLiteTable<any, any, any, any>>(
    table: TTable,
  ): DatabaseRegistryBuilder<TTables & Record<TableName<TTable>, TTable>> {
    return new DatabaseRegistryBuilder({
      ...this.#tables,
      [table.tableName]: table,
    } as TTables & Record<TableName<TTable>, TTable>);
  }

  build(): DatabaseRegistry<TTables> {
    return new DatabaseRegistry(this.#tables);
  }
}
