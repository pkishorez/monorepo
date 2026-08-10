import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import type { Effect } from 'effect';
import type { EntityType } from '../../../../../core/index.js';
import type { IdbDB, IdbDBError } from '../../idb-database/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { IdbEntityTable } from '../entity-table.js';
import { EntityTransaction } from './transact-op.js';
import { EntityWritePreparation } from './write-preparation.js';
import { EntityWriter } from './write.js';

export class EntityMutation<
  TTable extends IdbEntityTable,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
> {
  #writer: EntityWriter<TTable, TSecondaryDerivationMap, TSchema>;
  #transaction: EntityTransaction<TTable, TSecondaryDerivationMap, TSchema>;

  constructor(
    table: TTable,
    eschema: TSchema,
    index: EntityIndex<TTable, TSecondaryDerivationMap>,
    get: (
      key: Record<string, unknown>,
    ) => Effect.Effect<
      EntityType<ESchemaType<TSchema>> | null,
      IdbDBError,
      IdbDB
    >,
  ) {
    const preparation = new EntityWritePreparation(table, eschema, index);
    this.#writer = new EntityWriter(table, eschema, index, preparation, get);
    this.#transaction = new EntityTransaction(
      table,
      eschema,
      index,
      preparation,
      get,
    );
  }

  get insert() {
    return this.#writer.insert;
  }
  get getAndUpdate() {
    return this.#writer.getAndUpdate;
  }
  get delete() {
    return this.#writer.delete;
  }
  get restore() {
    return this.#writer.restore;
  }
  get hardDelete() {
    return this.#writer.hardDelete;
  }
  get dangerouslyRemoveAllItems() {
    return this.#writer.dangerouslyRemoveAllItems;
  }
  get insertOp() {
    return this.#transaction.insertOp;
  }
  get getAndUpdateOp() {
    return this.#transaction.getAndUpdateOp;
  }
  get deleteOp() {
    return this.#transaction.deleteOp;
  }
  get restoreOp() {
    return this.#transaction.restoreOp;
  }
}
