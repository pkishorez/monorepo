import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect, Schema } from 'effect';
import { MetaSchema, type EntityType } from '../../../../../core/index.js';
import { IdbDB, IdbDBError } from '../../idb-database/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { IdbEntityTable } from '../entity-table.js';

export const makeEntityGet =
  <
    TTable extends IdbEntityTable,
    TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
    TSchema extends AnyEntityESchema,
    TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
  >(
    table: TTable,
    eschema: TSchema,
    index: EntityIndex<TTable, TSecondaryDerivationMap>,
  ) =>
  (
    keyValue: Pick<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>> | null,
    IdbDBError,
    IdbDB
  > =>
    Effect.gen(function* () {
      const { Item } = yield* table.getItem(
        index.derivePrimary(keyValue as Record<string, unknown>),
      );
      if (!Item) return null;

      const _database = yield* IdbDB;
      const value = yield* eschema
        .decode({ ...Item._data, _v: Item._v })
        .pipe(
          Effect.mapError((cause) =>
            IdbDBError.getFailed(table.storeName, cause),
          ),
        );
      return {
        value: value as ESchemaType<TSchema>,
        meta: Schema.decodeSync(MetaSchema)({
          _v: Item._v,
          _u: Item._u,
          _d: Item._d,
          _e: Item._e ?? eschema.name,
        }),
      };
    }).pipe(
      Effect.withSpan('idb.entity.get', {
        attributes: { entity: eschema.name },
      }),
    );
