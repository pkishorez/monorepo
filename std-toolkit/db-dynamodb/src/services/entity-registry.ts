import { Effect, Option } from "effect";
import type { DynamoTableInstance } from "./dynamo-table.js";
import type { DynamoEntity } from "./dynamo-entity.js";
import type { TransactItem } from "../types/index.js";
import type { DescriptorProvider, RegistrySchema } from "@std-toolkit/core";
import { ConnectionService } from "@std-toolkit/core/server";
import { DynamodbError } from "../errors.js";

/**
 * Extracts the entity name from a DynamoEntity type.
 */
type EntityName<T> =
  T extends DynamoEntity<any, any, infer TSchema, any, any>
    ? TSchema["name"]
    : never;

/**
 * Type for a map of entity names to DynamoEntity instances.
 */
type EntitiesMap<TTable extends DynamoTableInstance> = Record<
  string,
  DynamoEntity<TTable, any, any, any>
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
  TTable extends DynamoTableInstance,
  TEntities extends EntitiesMap<TTable>,
> implements DescriptorProvider {
  /**
   * Creates a new entity registry builder for the given table.
   *
   * @typeParam TTable - The DynamoTable instance type
   * @param table - The DynamoTable instance
   * @returns A builder to register entities
   */
  static make<TTable extends DynamoTableInstance>(table: TTable) {
    return new EntityRegistryBuilder<TTable, {}>(table, {});
  }

  #table: TTable;
  #entities: TEntities;

  constructor(table: TTable, entities: TEntities) {
    this.#table = table;
    this.#entities = entities;
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
    items: TransactItem<EntityName<TEntities[keyof TEntities]>>[],
  ): Effect.Effect<void, DynamodbError> {
    return Effect.gen(this, function* () {
      // Execute the transaction
      yield* this.#table.transact(items);

      // Broadcast all entities after successful transaction
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
}

/**
 * Builder class for constructing an EntityRegistry with registered entities.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TEntities - Map of entity names to entity instances
 */
class EntityRegistryBuilder<
  TTable extends DynamoTableInstance,
  TEntities extends EntitiesMap<TTable>,
> {
  #table: TTable;
  #entities: TEntities;

  constructor(table: TTable, entities: TEntities) {
    this.#table = table;
    this.#entities = entities;
  }

  /**
   * Registers an entity with this entity registry.
   * The entity name is automatically extracted from its schema.
   *
   * @typeParam TEntity - The DynamoEntity type to register
   * @param entity - The entity instance to register
   * @returns A builder with the entity registered
   */
  register<TEntity extends DynamoEntity<TTable, any, any, any, any>>(
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
