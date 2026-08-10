import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect } from 'effect';
import { nextUlid } from '../../../../../core/index.js';
import type { RowMeta } from '../../../domain/entity-persistence/index.js';
import { SQLiteDatabase } from '../../sqlite-database/index.js';
import { SQLiteError } from '../../../domain/sqlite-error/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { SQLiteEntityTable } from '../entity-table.js';
import type { SqliteEntityOp, SqliteWriteOp } from '../sqlite-entity.js';

export class EntityWritePreparation<
  TTable extends SQLiteEntityTable,
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

  encode(
    value: ESchemaType<TSchema>,
    deleted: boolean,
  ): Effect.Effect<
    { encoded: Record<string, unknown>; meta: RowMeta },
    SQLiteError,
    SQLiteDatabase
  > {
    return Effect.gen({ self: this }, function* () {
      const _database = yield* SQLiteDatabase;
      const encoded = yield* this.#eschema
        .encode(value as Record<string, unknown>)
        .pipe(
          Effect.mapError((cause) =>
            SQLiteError.insertFailed(this.#table.tableName, cause),
          ),
        );
      return {
        encoded,
        meta: {
          _e: this.#eschema.name,
          _v: encoded._v as string,
          _u: yield* nextUlid,
          _d: deleted,
        },
      };
    });
  }

  prepareInsert(fullValue: ESchemaType<TSchema>) {
    return Effect.gen({ self: this }, function* () {
      const { encoded, meta } = yield* this.encode(fullValue, false);
      const valueWithMeta = { ...fullValue, _u: meta._u };
      const primary = this.#index.derivePrimary(valueWithMeta);
      return {
        item: {
          ...primary,
          _data: JSON.stringify(encoded),
          _e: this.#eschema.name,
          _v: meta._v,
          _u: meta._u,
          _d: 0,
          ...this.#index.deriveSecondary(valueWithMeta),
        } satisfies Record<string, unknown>,
        meta,
      };
    });
  }

  buildWriteOp(
    keyValue: Record<string, unknown>,
    fullValue: ESchemaType<TSchema>,
    deleted: boolean,
    expectedU: string | undefined,
    operationKind: SqliteEntityOp['operationKind'] = 'updateOp',
  ): Effect.Effect<SqliteEntityOp, SQLiteError, SQLiteDatabase> {
    return Effect.gen({ self: this }, function* () {
      const { encoded, meta } = yield* this.encode(fullValue, deleted);
      const key = this.#index.derivePrimary(keyValue);
      return {
        entityName: this.#eschema.name,
        operationKind,
        ...key,
        table: this.#table,
        apply: (u) => ({
          write: {
            type: 'update',
            key,
            values: {
              _data: JSON.stringify(encoded),
              _v: meta._v,
              _u: u,
              _d: deleted ? 1 : 0,
              ...this.#index.deriveSecondary({ ...fullValue, _u: u }),
            },
            ...(expectedU === undefined ? {} : { expectedU }),
          } satisfies SqliteWriteOp,
          entity: { value: fullValue, meta: { ...meta, _u: u } },
        }),
      };
    });
  }
}
