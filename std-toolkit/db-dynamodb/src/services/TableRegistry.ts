import { Effect } from "effect";
import type { DynamoTableInstance } from "./DynamoTable.js";
import type { DynamoEntity } from "./DynamoEntity.js";
import type { TransactItem, TableSchema } from "../types/index.js";
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
  DynamoEntity<TTable, any, any, any, any>
>;

/**
 * Registry for managing multiple entities within a single DynamoDB table.
 * Provides type-safe access to entities and cross-entity transactions.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TEntities - Map of entity names to entity instances
 */
export class TableRegistry<
  TTable extends DynamoTableInstance,
  TEntities extends EntitiesMap<TTable>,
> {
  /**
   * Creates a new table registry builder for the given table.
   *
   * @typeParam TTable - The DynamoTable instance type
   * @param table - The DynamoTable instance
   * @returns A builder to register entities
   */
  static make<TTable extends DynamoTableInstance>(table: TTable) {
    return new TableRegistryBuilder<TTable, {}>(table, {});
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
   *
   * @param items - Array of transaction items from registered entities
   * @returns Effect that completes when the transaction succeeds
   */
  transact(
    items: TransactItem<EntityName<TEntities[keyof TEntities]>>[],
  ): Effect.Effect<void, DynamodbError> {
    return this.#table.transact(items);
  }

  /**
   * Gets the full table schema for visualization purposes.
   * Includes table structure and all registered entity descriptors.
   *
   * @returns The complete table schema
   */
  getSchema(): TableSchema {
    const allSecondaryIndexes = Object.entries(this.#table.secondaryIndexMap);

    return {
      tableName: this.#table.tableName,
      primaryKey: this.#table.primary,
      globalSecondaryIndexes: allSecondaryIndexes
        .filter(([_, idx]) => idx.pk !== this.#table.primary.pk)
        .map(([name, idx]) => ({ name, pk: idx.pk, sk: idx.sk })),
      localSecondaryIndexes: allSecondaryIndexes
        .filter(([_, idx]) => idx.pk === this.#table.primary.pk)
        .map(([name, idx]) => ({ name, sk: idx.sk })),
      entities: Object.values(this.#entities).map((entity) =>
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
 * Builder class for constructing a TableRegistry with registered entities.
 */
class TableRegistryBuilder<
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
   * Registers an entity with this table registry.
   * The entity name is automatically extracted from its schema.
   *
   * @typeParam TEntity - The DynamoEntity type to register
   * @param entity - The entity instance to register
   * @returns A builder with the entity registered
   */
  register<TEntity extends DynamoEntity<TTable, any, any, any, any>>(
    entity: TEntity,
  ): TableRegistryBuilder<
    TTable,
    TEntities & Record<EntityName<TEntity>, TEntity>
  > {
    return new TableRegistryBuilder(this.#table, {
      ...this.#entities,
      [entity.name]: entity,
    } as TEntities & Record<EntityName<TEntity>, TEntity>);
  }

  /**
   * Builds the final TableRegistry instance.
   *
   * @returns The configured TableRegistry
   */
  build(): TableRegistry<TTable, TEntities> {
    return new TableRegistry(this.#table, this.#entities);
  }
}
