import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import type { Effect } from 'effect';
import type { EntityTable as DynamoTable } from '../../../domain/entity-persistence/index.js';
import type { DynamoDB } from '../../dynamodb/index.js';
import type { DynamoDBError } from '../../../domain/dynamodb-error/index.js';
import type { EntityType } from '../dynamo-entity.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import { EntityTransaction } from './transact-op.js';
import { EntityWriter } from './write.js';

export class EntityMutation<
  TTable extends DynamoTable<any, any>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
> {
  readonly #writer: EntityWriter<
    TTable,
    TSecondaryDerivationMap,
    TSchema,
    TPrimaryPkKeys
  >;
  readonly #transaction: EntityTransaction<
    TTable,
    TSecondaryDerivationMap,
    TSchema,
    TPrimaryPkKeys
  >;

  constructor(
    table: TTable,
    eschema: TSchema,
    index: EntityIndex<TSecondaryDerivationMap>,
    get: (
      keyValue: any,
      options?: { ConsistentRead?: boolean },
    ) => Effect.Effect<
      EntityType<ESchemaType<TSchema>> | null,
      DynamoDBError,
      DynamoDB
    >,
  ) {
    this.#writer = new EntityWriter(table, eschema, index, get);
    this.#transaction = new EntityTransaction(
      table,
      eschema,
      index,
      get,
      this.#writer,
    );
  }

  get insert() {
    return this.#writer.insert;
  }

  get batchInsert() {
    return this.#writer.batchInsert;
  }

  get update() {
    return this.#writer.update;
  }

  get delete() {
    return this.#writer.delete;
  }

  get hardDelete() {
    return this.#writer.hardDelete;
  }

  get dangerouslyRemoveAllItems() {
    return this.#writer.dangerouslyRemoveAllItems;
  }

  get restore() {
    return this.#writer.restore;
  }

  get getAndUpdate() {
    return this.#writer.getAndUpdate;
  }

  get insertOp() {
    return this.#transaction.insertOp;
  }

  get updateOp() {
    return this.#transaction.updateOp;
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
