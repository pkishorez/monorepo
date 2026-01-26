import { Effect } from "effect";
import type { DynamoTableInstance } from "./DynamoTable.js";
import type { DynamoEntity } from "./DynamoEntity.js";
import type { TransactItem, TableSchema } from "../types/index.js";
import { DynamodbError } from "../errors.js";

// Type to extract entity name from a DynamoEntity
type EntityName<T> = T extends DynamoEntity<any, any, infer TSchema, any>
  ? TSchema["name"]
  : never;

// Type for the entities map
type EntitiesMap<TTable extends DynamoTableInstance> = Record<
  string,
  DynamoEntity<TTable, any, any, any>
>;

export class TableRegistry<
  TTable extends DynamoTableInstance,
  TEntities extends EntitiesMap<TTable>,
> {
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
   * Execute a transaction with type-safe entity validation.
   * Only accepts TransactItems from entities registered in this registry.
   */
  transact(
    items: TransactItem<EntityName<TEntities[keyof TEntities]>>[],
  ): Effect.Effect<void, DynamodbError> {
    return this.#table.transact(items);
  }

  /**
   * Get the full schema for visualization purposes.
   * Includes table structure and all registered entity descriptors.
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
   * Access a registered entity by name (type-safe).
   */
  entity<K extends keyof TEntities>(name: K): TEntities[K] {
    return this.#entities[name];
  }

  /**
   * Get all registered entity names.
   */
  get entityNames(): (keyof TEntities)[] {
    return Object.keys(this.#entities) as (keyof TEntities)[];
  }

  /**
   * Get the underlying table instance.
   */
  get table(): TTable {
    return this.#table;
  }
}

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
   * Register an entity with this table registry.
   * The entity name is automatically extracted from its schema.
   */
  register<TEntity extends DynamoEntity<TTable, any, any, any>>(
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
   * Build the table registry instance.
   */
  build(): TableRegistry<TTable, TEntities> {
    return new TableRegistry(this.#table, this.#entities);
  }
}
