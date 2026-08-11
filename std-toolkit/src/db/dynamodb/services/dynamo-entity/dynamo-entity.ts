import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Schema } from 'effect';
import type { EntityTable as DynamoTable } from '../../domain/entity-persistence/index.js';
import type { TableEntitySnapshotSource } from '../../../../snapshot/index.js';
import type { IndexPkValue } from '../../types/index.js';
import { keyedSnapshotSource } from '../../../../snapshot/capture/table-capture/index.js';
import { tableSnapshotSource } from '../../../domain/entity-registry/index.js';
import { makeEntityBuilder } from './entity-builder.js';
import {
  EntityIndex,
  type StoredIndexDerivation,
  type StoredPrimaryDerivation,
} from './entity-index.js';
import { EntityMutation } from './mutation/index.js';
import { makeEntityRead } from './read/index.js';

const metaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _u: Schema.String,
  _d: Schema.Boolean,
});

type MetaType = typeof metaSchema.Type;

export interface EntityType<T> {
  value: T;
  meta: MetaType;
}

/**
 * A DynamoDB entity with type-safe CRUD operations and automatic index derivation.
 * Entities are built on top of a DynamoTable and use an ESchema for validation.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TSecondaryDerivationMap - Map of secondary index derivations
 * @typeParam TSchema - The ESchema type for this entity
 * @typeParam TPrimaryPkKeys - Keys used for primary partition key derivation
 */
export class DynamoEntity<
  TTable extends DynamoTable<any, any>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
> {
  #eschema: TSchema;
  #index: EntityIndex<TSecondaryDerivationMap>;
  #read: ReturnType<
    typeof makeEntityRead<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >
  >;
  #mutation: EntityMutation<
    TTable,
    TSecondaryDerivationMap,
    TSchema,
    TPrimaryPkKeys
  >;

  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: StoredPrimaryDerivation,
    secondaryDerivations: TSecondaryDerivationMap,
  ) {
    this.#eschema = eschema;
    this.#index = new EntityIndex(
      table,
      eschema,
      primaryDerivation,
      secondaryDerivations,
    );
    this.#read = makeEntityRead<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >(table, eschema, this.#index);
    this.#mutation = new EntityMutation(
      table,
      eschema,
      this.#index,
      (keyValue, options) => this.#read.get(keyValue, options),
    );
  }

  /**
   * Gets the entity name from the schema.
   */
  get name(): TSchema['name'] {
    return this.#eschema.name;
  }

  [tableSnapshotSource](): TableEntitySnapshotSource {
    return keyedSnapshotSource(
      this.#eschema,
      this.#index.primary,
      this.#index.secondary,
      (derivation) => derivation.gsiName,
    );
  }

  /**
   * Retrieves an entity by its primary key fields.
   *
   * @param keyValue - Object containing the primary key field values
   * @param options - Optional read options
   * @returns The entity if found, or null
   */
  get = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    options?: { ConsistentRead?: boolean },
  ) => this.#read.get(keyValue, options);

  /**
   * Inserts a new entity. Fails if an item with the same key already exists.
   *
   * @param value - The entity value to insert
   * @param options - Insert options including condition
   * @returns The inserted entity with metadata
   */
  get insert() {
    return this.#mutation.insert;
  }

  get batchInsert() {
    return this.#mutation.batchInsert;
  }

  get update() {
    return this.#mutation.update;
  }

  get delete() {
    return this.#mutation.delete;
  }

  get hardDelete() {
    return this.#mutation.hardDelete;
  }

  get dangerouslyRemoveAllItems() {
    return this.#mutation.dangerouslyRemoveAllItems;
  }

  get restore() {
    return this.#mutation.restore;
  }

  get insertOp() {
    return this.#mutation.insertOp;
  }

  get updateOp() {
    return this.#mutation.updateOp;
  }

  get getAndUpdate() {
    return this.#mutation.getAndUpdate;
  }

  get getAndUpdateOp() {
    return this.#mutation.getAndUpdateOp;
  }

  get deleteOp() {
    return this.#mutation.deleteOp;
  }

  get restoreOp() {
    return this.#mutation.restoreOp;
  }

  get query() {
    return this.#read.query;
  }

  get queryStream() {
    return this.#read.queryStream;
  }
}

export const makeDynamoEntity = <TTable extends DynamoTable<any, any>>(
  table: TTable,
  onBuild?: (entity: DynamoEntity<any, any, any, any>) => void,
) => makeEntityBuilder(table, onBuild);
