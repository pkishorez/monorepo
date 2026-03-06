import { Effect, Option } from "effect";
import type { DynamoTable } from "./dynamo-table.js";
import type { DynamoEntity } from "./dynamo-entity.js";
import type { DynamoSingleEntity } from "./dynamo-single-entity.js";
import type { TransactItem } from "../types/index.js";
import type { DescriptorProvider, RegistrySchema } from "@std-toolkit/core";
import { ConnectionService } from "@std-toolkit/core/server";
import { DynamodbError } from "../errors.js";

/**
 * Extracts the entity name from a DynamoEntity type.
 */
type EntityName<T> =
  T extends DynamoEntity<any, any, infer TSchema, any>
    ? TSchema["name"]
    : never;

/**
 * Extracts the entity name from a DynamoSingleEntity type.
 */
type SingleEntityName<T> =
  T extends DynamoSingleEntity<any, infer TSchema> ? TSchema["name"] : never;

/**
 * Type for a map of entity names to DynamoEntity instances.
 */
type EntitiesMap<TTable extends DynamoTable<any, any>> = Record<
  string,
  DynamoEntity<TTable, any, any, any>
>;

/**
 * Type for a map of entity names to DynamoSingleEntity instances.
 */
type SingleEntitiesMap<TTable extends DynamoTable<any, any>> = Record<
  string,
  DynamoSingleEntity<TTable, any>
>;

/**
 * Registry for managing multiple entities within a single DynamoDB table.
 * Implements DescriptorProvider for unified schema access across database types.
 * Provides type-safe access to entities and cross-entity transactions.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TEntities - Map of entity names to entity instances
 */
export class EntityRegistry<
  TTable extends DynamoTable<any, any>,
  TEntities extends EntitiesMap<TTable>,
  TSingleEntities extends SingleEntitiesMap<TTable> = {},
> implements DescriptorProvider {
  /**
   * Creates a new entity registry builder for the given table.
   *
   * @typeParam TTable - The DynamoTable instance type
   * @param table - The DynamoTable instance
   * @returns A builder to register entities
   */
  static make<TTable extends DynamoTable<any, any>>(table: TTable) {
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
   * Executes a transaction with type-safe entity validation.
   * Only accepts TransactItems from entities registered in this registry.
   * Broadcasts all entity changes after successful transaction.
   *
   * @param items - Array of transaction items from registered entities
   * @returns Effect that completes when the transaction succeeds
   */
  transact(
    items: TransactItem<
      | EntityName<TEntities[keyof TEntities]>
      | SingleEntityName<TSingleEntities[keyof TSingleEntities]>
    >[],
  ): Effect.Effect<void, DynamodbError> {
    return Effect.gen(this, function* () {
      yield* this.#table.transact(items);

      const connectionService = yield* Effect.serviceOption(
        ConnectionService,
      ).pipe(Effect.andThen(Option.getOrNull));

      if (connectionService) {
        for (const item of items) {
          if (item.broadcast) {
            connectionService.broadcast(item.broadcast);
          }
        }
      }
    });
  }

  /**
   * Gets the schema including all registered entity descriptors.
   * Single entities are excluded — they have no index pattern visualization.
   */
  getSchema(): RegistrySchema {
    return {
      descriptors: Object.values(this.#entities).map((entity) =>
        entity.getDescriptor(),
      ),
    };
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
}

/**
 * Builder class for constructing an EntityRegistry with registered entities.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TEntities - Map of entity names to entity instances
 */
class EntityRegistryBuilder<
  TTable extends DynamoTable<any, any>,
  TEntities extends EntitiesMap<TTable>,
  TSingleEntities extends SingleEntitiesMap<TTable>,
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
   * Registers an entity with this entity registry.
   * The entity name is automatically extracted from its schema.
   *
   * @typeParam TEntity - The DynamoEntity type to register
   * @param entity - The entity instance to register
   * @returns A builder with the entity registered
   */
  register<TEntity extends DynamoEntity<TTable, any, any, any>>(
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
   * Registers a single entity with this entity registry.
   * The entity name is automatically extracted from its schema.
   *
   * @typeParam TEntity - The DynamoSingleEntity type to register
   * @param entity - The single entity instance to register
   * @returns A builder with the single entity registered
   */
  registerSingle<TEntity extends DynamoSingleEntity<TTable, any>>(
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
