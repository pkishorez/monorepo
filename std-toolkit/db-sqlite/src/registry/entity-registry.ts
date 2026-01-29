import { Effect } from "effect";
import type { SQLiteEntity } from "../services/SQLiteEntity.js";
import type { SQLiteTableInstance } from "../services/SQLiteTable.js";
import type { DescriptorProvider, RegistrySchema } from "@std-toolkit/core";
import { SqliteDB, SqliteDBError } from "../sql/db.js";

// Extract entity name from SQLiteEntity
type EntityName<T> =
  T extends SQLiteEntity<any, infer S, any> ? S["name"] : never;

// Entities map type
type EntitiesMap = Record<string, SQLiteEntity<any, any, any>>;

/**
 * Registry for managing multiple entities on a single shared SQLite table.
 * Implements DescriptorProvider for unified schema access.
 * Provides type-safe access to entities and database operations.
 *
 * @typeParam TTable - The shared SQLiteTable instance type
 * @typeParam TEntities - Map of entity names to SQLiteEntity instances
 */
export class EntityRegistry<
  TTable extends SQLiteTableInstance,
  TEntities extends EntitiesMap,
> implements DescriptorProvider {
  /**
   * Creates a new entity registry builder for the given table.
   *
   * @param table - The shared SQLiteTable instance
   * @returns A builder to register entities
   */
  static make<TTable extends SQLiteTableInstance>(table: TTable) {
    return new EntityRegistryBuilder<TTable, {}>(table, {});
  }

  #table: TTable;
  #entities: TEntities;

  constructor(table: TTable, entities: TEntities) {
    this.#table = table;
    this.#entities = entities;
  }

  /**
   * Accesses a registered entity by its name.
   *
   * @typeParam K - The entity name key
   * @param name - The entity name
   * @returns The entity instance
   */
  entity<K extends keyof TEntities>(name: K): TEntities[K] {
    return this.#entities[name];
  }

  /**
   * Gets all registered entity names.
   */
  get entityNames(): (keyof TEntities)[] {
    return Object.keys(this.#entities) as (keyof TEntities)[];
  }

  /**
   * Gets the underlying table instance.
   */
  get table(): TTable {
    return this.#table;
  }

  /**
   * Sets up the shared table (creates table and indexes).
   *
   * @returns Effect that completes when setup is done
   */
  setup(): Effect.Effect<void, SqliteDBError, SqliteDB> {
    return this.#table.setup();
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
   * Gets the full database schema including all registered entity descriptors.
   */
  getSchema(): RegistrySchema {
    return {
      descriptors: Object.values(this.#entities).map((e) => e.getDescriptor()),
    };
  }
}

/**
 * Builder class for constructing an EntityRegistry with registered entities.
 *
 * @typeParam TTable - The shared SQLiteTable instance type
 * @typeParam TEntities - Map of entity names to SQLiteEntity instances
 */
class EntityRegistryBuilder<
  TTable extends SQLiteTableInstance,
  TEntities extends EntitiesMap,
> {
  #table: TTable;
  #entities: TEntities;

  constructor(table: TTable, entities: TEntities) {
    this.#table = table;
    this.#entities = entities;
  }

  /**
   * Registers an entity with this registry.
   * The entity name is automatically extracted from its schema.
   *
   * @typeParam TEntity - The SQLiteEntity type to register
   * @param entity - The entity instance to register
   * @returns A builder with the entity registered
   */
  register<TEntity extends SQLiteEntity<any, any, any, any>>(
    entity: TEntity,
  ): EntityRegistryBuilder<
    TTable,
    TEntities & Record<EntityName<TEntity>, TEntity>
  > {
    return new EntityRegistryBuilder(this.#table, {
      ...this.#entities,
      [entity.name]: entity,
    } as TEntities & Record<EntityName<TEntity>, TEntity>);
  }

  /**
   * Builds the final EntityRegistry instance.
   *
   * @returns The configured EntityRegistry
   */
  build(): EntityRegistry<TTable, TEntities> {
    return new EntityRegistry(this.#table, this.#entities);
  }
}
