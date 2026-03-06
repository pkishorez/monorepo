import { Effect, Exit, FiberRef, Option } from "effect";
import type { SQLiteEntity } from "./sqlite-entity.js";
import type { SQLiteSingleEntity } from "./sqlite-single-entity.js";
import type { SQLiteTableInstance } from "./sqlite-table.js";
import type { DescriptorProvider, RegistrySchema } from "@std-toolkit/core";
import { ConnectionService } from "@std-toolkit/core/server";
import { SqliteDB, SqliteDBError, TransactionPendingBroadcasts } from "../sql/db.js";

// Extract entity name from SQLiteEntity
type EntityName<T> =
  T extends SQLiteEntity<any, infer S, any> ? S["name"] : never;

// Extract entity name from SQLiteSingleEntity
type SingleEntityName<T> =
  T extends SQLiteSingleEntity<any, infer TSchema> ? TSchema["name"] : never;

// Entities map type
type EntitiesMap = Record<string, SQLiteEntity<any, any, any>>;

// Single entities map type
type SingleEntitiesMap = Record<string, SQLiteSingleEntity<any, any>>;

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
  TSingleEntities extends SingleEntitiesMap = {},
> implements DescriptorProvider {
  /**
   * Creates a new entity registry builder for the given table.
   *
   * @param table - The shared SQLiteTable instance
   * @returns A builder to register entities
   */
  static make<TTable extends SQLiteTableInstance>(table: TTable) {
    return new EntityRegistryBuilder<TTable, {}, {}>(table, {}, {});
  }

  #table: TTable;
  #entities: TEntities;
  #singleEntities: TSingleEntities;

  constructor(
    table: TTable,
    entities: TEntities,
    singleEntities: TSingleEntities,
  ) {
    this.#table = table;
    this.#entities = entities;
    this.#singleEntities = singleEntities;
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
   * Accesses a registered single entity by its name.
   *
   * @typeParam K - The single entity name key
   * @param name - The single entity name
   * @returns The single entity instance
   */
  singleEntity<K extends keyof TSingleEntities>(name: K): TSingleEntities[K] {
    return this.#singleEntities[name];
  }

  /**
   * Gets all registered entity names (both regular and single entities).
   */
  get entityNames(): (keyof TEntities | keyof TSingleEntities)[] {
    return [
      ...Object.keys(this.#entities),
      ...Object.keys(this.#singleEntities),
    ] as (keyof TEntities | keyof TSingleEntities)[];
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

  transaction<A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | SqliteDBError, R | SqliteDB> {
    return Effect.gen(function* () {
      const currentState = yield* FiberRef.get(TransactionPendingBroadcasts);
      if (Option.isSome(currentState)) {
        return yield* Effect.fail(SqliteDBError.nestedTransactionNotSupported());
      }

      yield* FiberRef.set(TransactionPendingBroadcasts, Option.some([]));

      const result = yield* Effect.acquireUseRelease(
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

      const pending = yield* FiberRef.get(TransactionPendingBroadcasts);
      if (Option.isSome(pending)) {
        const connectionService = yield* Effect.serviceOption(
          ConnectionService,
        ).pipe(Effect.andThen(Option.getOrNull));
        if (connectionService) {
          for (const entity of pending.value) {
            connectionService.broadcast(entity);
          }
        }
      }

      yield* FiberRef.set(TransactionPendingBroadcasts, Option.none());

      return result;
    });
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
  TSingleEntities extends SingleEntitiesMap,
> {
  #table: TTable;
  #entities: TEntities;
  #singleEntities: TSingleEntities;

  constructor(
    table: TTable,
    entities: TEntities,
    singleEntities: TSingleEntities,
  ) {
    this.#table = table;
    this.#entities = entities;
    this.#singleEntities = singleEntities;
  }

  /**
   * Registers an entity with this registry.
   * The entity name is automatically extracted from its schema.
   *
   * @typeParam TEntity - The SQLiteEntity type to register
   * @param entity - The entity instance to register
   * @returns A builder with the entity registered
   */
  register<TEntity extends SQLiteEntity<any, any, any>>(
    entity: TEntity,
  ): EntityRegistryBuilder<
    TTable,
    TEntities & Record<EntityName<TEntity>, TEntity>,
    TSingleEntities
  > {
    return new EntityRegistryBuilder(
      this.#table,
      {
        ...this.#entities,
        [entity.name]: entity,
      } as TEntities & Record<EntityName<TEntity>, TEntity>,
      this.#singleEntities,
    );
  }

  /**
   * Registers a single entity with this registry.
   * The entity name is automatically extracted from its schema.
   *
   * @typeParam TEntity - The SQLiteSingleEntity type to register
   * @param entity - The single entity instance to register
   * @returns A builder with the single entity registered
   */
  registerSingle<TEntity extends SQLiteSingleEntity<any, any>>(
    entity: TEntity,
  ): EntityRegistryBuilder<
    TTable,
    TEntities,
    TSingleEntities & Record<SingleEntityName<TEntity>, TEntity>
  > {
    return new EntityRegistryBuilder(
      this.#table,
      this.#entities,
      {
        ...this.#singleEntities,
        [entity.name]: entity,
      } as TSingleEntities & Record<SingleEntityName<TEntity>, TEntity>,
    );
  }

  /**
   * Builds the final EntityRegistry instance.
   *
   * @returns The configured EntityRegistry
   */
  build(): EntityRegistry<TTable, TEntities, TSingleEntities> {
    return new EntityRegistry(
      this.#table,
      this.#entities,
      this.#singleEntities,
    );
  }
}
