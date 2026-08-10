import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect } from 'effect';
import { nextUlid, type EntityType } from '../../../../../core/index.js';
import { IdbDB, IdbDBError, type IdbRecord } from '../../idb-database/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { IdbEntityTable } from '../entity-table.js';

export class EntityWritePreparation<
  TTable extends IdbEntityTable,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
> {
  #table: TTable;
  #eschema: TSchema;
  #index: EntityIndex<TTable, TSecondaryDerivationMap>;

  constructor(
    table: TTable,
    eschema: TSchema,
    index: EntityIndex<TTable, TSecondaryDerivationMap>,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#index = index;
  }

  encode(value: ESchemaType<TSchema>, deleted: boolean) {
    return Effect.gen({ self: this }, function* () {
      const _database = yield* IdbDB;
      const encoded = yield* this.#eschema
        .encode(value as Record<string, unknown>)
        .pipe(
          Effect.mapError((cause) =>
            IdbDBError.putFailed(this.#table.storeName, cause),
          ),
        );
      return {
        encoded,
        meta: {
          _e: this.#eschema.name,
          _v: encoded._v as string,
          _u: yield* nextUlid,
          _d: deleted,
        } satisfies EntityType<ESchemaType<TSchema>>['meta'],
      };
    });
  }

  prepareRecord(
    value: ESchemaType<TSchema>,
    deleted: boolean,
    keyValue: Record<string, unknown>,
  ): Effect.Effect<
    { record: IdbRecord; meta: EntityType<ESchemaType<TSchema>>['meta'] },
    IdbDBError,
    IdbDB
  > {
    return Effect.gen({ self: this }, function* () {
      const { encoded, meta } = yield* this.encode(value, deleted);
      const record: IdbRecord = {
        ...this.#index.derivePrimary(keyValue),
        _data: encoded,
        _e: this.#eschema.name,
        _v: meta._v,
        _u: meta._u,
        _d: deleted,
        ...this.#index.deriveSecondary({ ...value, _u: meta._u }),
      };
      return { record, meta };
    });
  }
}
