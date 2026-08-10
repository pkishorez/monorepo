import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import type { EntityType } from '../../../../core/index.js';
import type { IdbWriteOp } from '../idb-database/index.js';
import type { TableEntitySnapshotSource } from '../../../../snapshot/index.js';
import {
  keyedSnapshotSource,
  tableSnapshotSource,
} from '../../../../snapshot/table-adapter/index.js';
import { makeEntityBuilder } from './entity-builder.js';
import {
  EntityIndex,
  type StoredIndexDerivation,
  type StoredPrimaryDerivation,
} from './entity-index.js';
import type { IdbEntityTable } from './entity-table.js';
import { EntityMutation } from './mutation/index.js';
import { makeEntityRead } from './read/index.js';

type EntityKey<
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
> = Pick<ESchemaType<TSchema>, TPrimaryPkKeys> &
  Pick<ESchemaType<TSchema>, TSchema['idField']>;
type UpdateInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>> | null);
type UpdateOpInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>>);

export interface IdbEntityOp<T = unknown> {
  readonly entityName: string;
  readonly operationKind: 'insertOp' | 'updateOp' | 'deleteOp' | 'restoreOp';
  readonly pk: string;
  readonly sk: string;
  readonly table: unknown;
  readonly apply: (u: string) => {
    write: IdbWriteOp;
    entity: EntityType<T>;
  };
}

export class IdbEntity<
  TTable extends IdbEntityTable,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
> {
  #eschema: TSchema;
  #index: EntityIndex<TTable, TSecondaryDerivationMap>;
  #read: ReturnType<
    typeof makeEntityRead<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >
  >;
  #mutation: EntityMutation<TTable, TSecondaryDerivationMap, TSchema>;

  constructor(
    table: TTable,
    eschema: TSchema,
    primary: StoredPrimaryDerivation,
    secondary: TSecondaryDerivationMap,
  ) {
    this.#eschema = eschema;
    this.#index = new EntityIndex(table, eschema, primary, secondary);
    this.#read = makeEntityRead<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >(table, eschema, this.#index);
    this.#mutation = new EntityMutation(table, eschema, this.#index, (key) =>
      this.#read.get(key as EntityKey<TSchema, TPrimaryPkKeys>),
    );
  }

  get name(): TSchema['name'] {
    return this.#eschema.name;
  }

  get idField(): TSchema['idField'] {
    return this.#eschema.idField;
  }

  [tableSnapshotSource](): TableEntitySnapshotSource {
    return keyedSnapshotSource(
      this.#eschema,
      this.#index.primary,
      this.#index.secondary,
      (derivation) => derivation.indexName,
    );
  }

  get = (key: EntityKey<TSchema, TPrimaryPkKeys>) => this.#read.get(key);

  get insert() {
    return this.#mutation.insert;
  }

  getAndUpdate = (
    key: EntityKey<TSchema, TPrimaryPkKeys>,
    update: UpdateInput<ESchemaType<TSchema>>,
    config?: { retries?: number; lastWriteWins?: boolean },
  ) => this.#mutation.getAndUpdate(key, update, config);

  delete = (key: EntityKey<TSchema, TPrimaryPkKeys>) =>
    this.#mutation.delete(key);

  restore = (key: EntityKey<TSchema, TPrimaryPkKeys>) =>
    this.#mutation.restore(key);

  hardDelete = (
    key: EntityKey<TSchema, TPrimaryPkKeys>,
    confirmation: 'I KNOW WHAT I AM DOING',
  ) => this.#mutation.hardDelete(key, confirmation);

  get dangerouslyRemoveAllItems() {
    return this.#mutation.dangerouslyRemoveAllItems;
  }

  get query() {
    return this.#read.query;
  }

  get queryStream() {
    return this.#read.queryStream;
  }

  get insertOp() {
    return this.#mutation.insertOp;
  }

  getAndUpdateOp = (
    key: EntityKey<TSchema, TPrimaryPkKeys>,
    update: UpdateOpInput<ESchemaType<TSchema>>,
    options?: { lastWriteWins?: boolean },
  ) => this.#mutation.getAndUpdateOp(key, update, options);

  deleteOp = (
    key: EntityKey<TSchema, TPrimaryPkKeys>,
    options?: { lastWriteWins?: boolean },
  ) => this.#mutation.deleteOp(key, options);

  restoreOp = (
    key: EntityKey<TSchema, TPrimaryPkKeys>,
    options?: { lastWriteWins?: boolean },
  ) => this.#mutation.restoreOp(key, options);
}

export const makeIdbEntity = <TTable extends IdbEntityTable>(
  table: TTable,
  onBuild?: (entity: IdbEntity<any, any, any, any>) => void,
) => makeEntityBuilder(table, onBuild);
