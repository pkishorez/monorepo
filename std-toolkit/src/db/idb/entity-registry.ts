import { Effect, Option } from 'effect';
import type { IdbEntity, IdbEntityOp } from './idb-entity.js';
import type { IdbSingleEntity } from './idb-single-entity.js';
import type { IdbTableInstance } from './idb-table.js';
import { Broadcaster } from '../../core/index.js';
import { IdbDB, IdbDBError } from './db.js';

// Extract entity name from IdbEntity
type EntityName<T> = T extends IdbEntity<any, infer S, any> ? S['name'] : never;

// Extract entity name from IdbSingleEntity
type SingleEntityName<T> =
  T extends IdbSingleEntity<any, infer S> ? S['name'] : never;

// Entities map type
type EntitiesMap = Record<string, IdbEntity<any, any, any>>;

// Single entities map type
type SingleEntitiesMap = Record<string, IdbSingleEntity<any, any>>;

/**
 * Registry for managing multiple entities on a single shared IndexedDB
 * table. Provides type-safe access to entities and, unlike SQLite's
 * interactive `transaction(effect)`, a buffered `transact(ops)` that applies
 * pre-built op descriptors in one native IndexedDB transaction — see
 * `src/db/idb/docs/adr/0001-buffered-transactions-and-auto-versioning.md`.
 *
 * @typeParam TTable - The shared IdbTable instance type
 * @typeParam TEntities - Map of entity names to IdbEntity instances
 * @typeParam TSingleEntities - Map of single entity names to IdbSingleEntity instances
 */
export class EntityRegistry<
  TTable extends IdbTableInstance,
  TEntities extends EntitiesMap,
  TSingleEntities extends SingleEntitiesMap = {},
> {
  /**
   * Creates a new entity registry builder for the given table.
   *
   * @param table - The shared IdbTable instance
   * @returns A builder to register entities
   */
  static make<TTable extends IdbTableInstance>(table: TTable) {
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
   * Sets up the shared table (creates the object store and any missing
   * secondary indexes).
   *
   * @returns Effect that completes when setup is done
   */
  setup(): Effect.Effect<void, IdbDBError, IdbDB> {
    return this.#table.setup();
  }

  /**
   * Applies every op in ONE native IndexedDB read-write transaction, or
   * none do — the atomic multi-entity write this adapter exists to provide
   * (see the buffered-transactions ADR). Ops are built ahead of time via
   * each entity's `insertOp`/`updateOp`, outside any transaction.
   *
   * Broadcasts fire only after the underlying transaction commits, in op
   * order; a failed transaction broadcasts nothing.
   *
   * @param ops - Pre-built op descriptors from registered entities
   * @returns Effect that completes when the transaction (and broadcasts) are done
   */
  transact(
    ops: ReadonlyArray<IdbEntityOp>,
  ): Effect.Effect<void, IdbDBError, IdbDB> {
    return Effect.gen(function* () {
      const db = yield* IdbDB;
      yield* db.transact(ops.map((op) => op.write));

      const connectionService = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );
      if (connectionService) {
        for (const op of ops) {
          connectionService.broadcast(op.entity);
        }
      }
    });
  }
}

/**
 * Builder class for constructing an EntityRegistry with registered entities.
 *
 * @typeParam TTable - The shared IdbTable instance type
 * @typeParam TEntities - Map of entity names to IdbEntity instances
 * @typeParam TSingleEntities - Map of single entity names to IdbSingleEntity instances
 */
class EntityRegistryBuilder<
  TTable extends IdbTableInstance,
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
   * @typeParam TEntity - The IdbEntity type to register
   * @param entity - The entity instance to register
   * @returns A builder with the entity registered
   */
  register<TEntity extends IdbEntity<any, any, any>>(
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
   * @typeParam TEntity - The IdbSingleEntity type to register
   * @param entity - The single entity instance to register
   * @returns A builder with the single entity registered
   */
  registerSingle<TEntity extends IdbSingleEntity<any, any>>(
    entity: TEntity,
  ): EntityRegistryBuilder<
    TTable,
    TEntities,
    TSingleEntities & Record<SingleEntityName<TEntity>, TEntity>
  > {
    return new EntityRegistryBuilder(this.#table, this.#entities, {
      ...this.#singleEntities,
      [entity.name]: entity,
    } as TSingleEntities & Record<SingleEntityName<TEntity>, TEntity>);
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
