import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect, Schema } from 'effect';
import { EntityPersistence } from '../../../domain/entity-persistence/index.js';
import type { SQLiteDatabase } from '../../sqlite-database/index.js';
import { SQLiteError } from '../../../domain/sqlite-error/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { SQLiteEntityTable } from '../entity-table.js';
import type { EntityType } from '../sqlite-entity.js';

type IndexKeyFields<T, K extends keyof T> = Pick<T, K>;

export const makeEntityGet =
  <
    TTable extends SQLiteEntityTable,
    TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
    TSchema extends AnyEntityESchema,
    TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
  >(
    table: TTable,
    eschema: TSchema,
    index: EntityIndex<TTable, TSecondaryDerivationMap>,
  ) =>
  (
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>> | null,
    SQLiteError,
    SQLiteDatabase
  > =>
    Effect.gen(function* () {
      const { Item } = yield* table.getItem(
        index.derivePrimary(keyValue as Record<string, unknown>),
      );
      if (!Item) return null;

      const value = yield* eschema
        .decode({ ...JSON.parse(Item._data), _v: Item._v })
        .pipe(
          Effect.mapError((cause) =>
            SQLiteError.queryFailed(table.tableName, cause),
          ),
        );

      return {
        value: value as ESchemaType<TSchema>,
        meta: Schema.decodeSync(EntityPersistence.sqlMetaSchema)({
          _v: Item._v,
          _u: Item._u,
          _d: Item._d,
          _e: Item._e ?? eschema.name,
        }),
      };
    }).pipe(
      Effect.withSpan('sqlite.entity.get', {
        attributes: { entity: eschema.name },
      }),
    );
