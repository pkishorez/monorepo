import { Effect } from "effect";
import type { SQLiteTable } from "../table/table.js";
import type { DescriptorProvider, RegistrySchema } from "@std-toolkit/core";
import { SqliteDB, SqliteDBError } from "../sql/db.js";

// Extract table name from SQLiteTable
type TableName<T> = T extends SQLiteTable<infer S, any, any, any> ? S["name"] : never;

// Tables map type
type TablesMap = Record<string, SQLiteTable<any, any, any, any>>;

/**
 * Registry for managing multiple tables within a SQLite database.
 * Implements DescriptorProvider for unified schema access across database types.
 * Provides type-safe access to tables and database operations.
 *
 * @typeParam TTables - Map of table names to SQLiteTable instances
 */
export class DatabaseRegistry<TTables extends TablesMap> implements DescriptorProvider {
  /**
   * Creates a new database registry builder.
   *
   * @returns A builder to register tables
   */
  static make() {
    return new DatabaseRegistryBuilder<{}>({});
  }

  #tables: TTables;

  constructor(tables: TTables) {
    this.#tables = tables;
  }

  /**
   * Accesses a registered table by its name.
   *
   * @typeParam K - The table name key
   * @param name - The table name
   * @returns The table instance
   */
  table<K extends keyof TTables>(name: K): TTables[K] {
    return this.#tables[name];
  }

  /**
   * Gets all registered table names.
   */
  get tableNames(): (keyof TTables)[] {
    return Object.keys(this.#tables) as (keyof TTables)[];
  }

  /**
   * Sets up all registered tables (creates tables and indexes).
   *
   * @returns Effect that completes when all tables are set up
   */
  setup(): Effect.Effect<void, SqliteDBError, SqliteDB> {
    return Effect.all(
      Object.values(this.#tables).map((t) => t.setup()),
      { concurrency: 1 },
    ).pipe(Effect.asVoid);
  }

  /**
   * Wraps an effect in a database transaction.
   *
   * @param effect - The effect to run in a transaction
   * @returns The effect wrapped in a transaction
   */
  transaction<A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | SqliteDBError, R | SqliteDB> {
    return SqliteDB.transaction(effect);
  }

  /**
   * Gets the full database schema including all registered table descriptors.
   */
  getSchema(): RegistrySchema {
    return {
      descriptors: Object.values(this.#tables).map((t) => t.getDescriptor()),
    };
  }
}

/**
 * Builder class for constructing a DatabaseRegistry with registered tables.
 *
 * @typeParam TTables - Map of table names to SQLiteTable instances
 */
class DatabaseRegistryBuilder<TTables extends TablesMap> {
  #tables: TTables;

  constructor(tables: TTables) {
    this.#tables = tables;
  }

  /**
   * Registers a table with this database registry.
   * The table name is automatically extracted from its schema.
   *
   * @typeParam TTable - The SQLiteTable type to register
   * @param table - The table instance to register
   * @returns A builder with the table registered
   */
  register<TTable extends SQLiteTable<any, any, any, any>>(
    table: TTable,
  ): DatabaseRegistryBuilder<TTables & Record<TableName<TTable>, TTable>> {
    return new DatabaseRegistryBuilder({
      ...this.#tables,
      [table.tableName]: table,
    } as TTables & Record<TableName<TTable>, TTable>);
  }

  /**
   * Builds the final DatabaseRegistry instance.
   *
   * @returns The configured DatabaseRegistry
   */
  build(): DatabaseRegistry<TTables> {
    return new DatabaseRegistry(this.#tables);
  }
}
