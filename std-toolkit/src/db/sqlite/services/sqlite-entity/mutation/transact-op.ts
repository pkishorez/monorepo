import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect } from 'effect';
import type { SQLiteDatabase } from '../../sqlite-database/index.js';
import { SQLiteError } from '../../../domain/sqlite-error/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { SQLiteEntityTable } from '../entity-table.js';
import type {
  EntityType,
  SqliteEntityOp,
  SqliteWriteOp,
} from '../sqlite-entity.js';
import type { EntityWritePreparation } from './write-preparation.js';

type InsertInput<T> = Omit<T, '_v'>;
type UpdateInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>>);
type EntityGet<TSchema extends AnyEntityESchema> = (
  key: Record<string, unknown>,
) => Effect.Effect<
  EntityType<ESchemaType<TSchema>> | null,
  SQLiteError,
  SQLiteDatabase
>;

export class EntityTransaction<
  TTable extends SQLiteEntityTable,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
> {
  #table: TTable;
  #eschema: TSchema;
  #index: EntityIndex<TTable, TSecondaryDerivationMap>;
  #preparation: EntityWritePreparation<
    TTable,
    TSecondaryDerivationMap,
    TSchema
  >;
  #get: EntityGet<TSchema>;

  constructor(
    table: TTable,
    eschema: TSchema,
    index: EntityIndex<TTable, TSecondaryDerivationMap>,
    preparation: EntityWritePreparation<
      TTable,
      TSecondaryDerivationMap,
      TSchema
    >,
    get: EntityGet<TSchema>,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#index = index;
    this.#preparation = preparation;
    this.#get = get;
  }

  insertOp = (
    value: InsertInput<ESchemaType<TSchema>>,
  ): Effect.Effect<SqliteEntityOp, SQLiteError, SQLiteDatabase> =>
    Effect.gen({ self: this }, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;
      const { item, meta } = yield* this.#preparation.prepareInsert(fullValue);

      return {
        entityName: this.#eschema.name,
        operationKind: 'insertOp',
        pk: item.pk as string,
        sk: item.sk as string,
        table: this.#table,
        apply: (u) => {
          const valueWithMeta = { ...fullValue, _u: u };
          const key = this.#index.derivePrimary(valueWithMeta);
          return {
            write: {
              type: 'insert',
              key,
              values: {
                ...item,
                ...key,
                _u: u,
                ...this.#index.deriveSecondary(valueWithMeta),
              },
            } satisfies SqliteWriteOp,
            entity: { value: fullValue, meta: { ...meta, _u: u } },
          };
        },
      };
    });

  getAndUpdateOp = (
    keyValue: Record<string, unknown>,
    update: UpdateInput<ESchemaType<TSchema>>,
    options?: { lastWriteWins?: boolean },
  ) =>
    Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SQLiteError.noItemToUpdate(this.#table.tableName),
        );
      }
      const value = {
        ...existing.value,
        ...(typeof update === 'function' ? update(existing.value) : update),
      } as ESchemaType<TSchema>;
      return yield* this.#preparation.buildWriteOp(
        keyValue,
        value,
        existing.meta._d,
        options?.lastWriteWins ? undefined : existing.meta._u,
      );
    });

  deleteOp = (
    keyValue: Record<string, unknown>,
    options?: { lastWriteWins?: boolean },
  ) => this.#tombstoneOp(keyValue, true, options);

  restoreOp = (
    keyValue: Record<string, unknown>,
    options?: { lastWriteWins?: boolean },
  ) => this.#tombstoneOp(keyValue, false, options);

  #tombstoneOp(
    keyValue: Record<string, unknown>,
    deleted: boolean,
    options?: { lastWriteWins?: boolean },
  ) {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          deleted
            ? SQLiteError.noItemToDelete(this.#table.tableName)
            : SQLiteError.noItemToRestore(this.#table.tableName),
        );
      }
      return yield* this.#preparation.buildWriteOp(
        keyValue,
        existing.value,
        deleted,
        options?.lastWriteWins ? undefined : existing.meta._u,
        deleted ? 'deleteOp' : 'restoreOp',
      );
    });
  }
}
