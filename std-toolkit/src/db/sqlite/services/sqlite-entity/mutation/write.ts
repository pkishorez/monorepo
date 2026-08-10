import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect, Option } from 'effect';
import { Broadcaster } from '../../../../../core/index.js';
import { SQL as Sql } from '../../../domain/sql-statement/index.js';
import { SQLiteDatabase } from '../../sqlite-database/index.js';
import { SQLiteError } from '../../../domain/sqlite-error/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { SQLiteEntityTable } from '../entity-table.js';
import type { EntityType } from '../sqlite-entity.js';
import type { EntityWritePreparation } from './write-preparation.js';

type InsertInput<T> = Omit<T, '_v'>;
type UpdateInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>> | null);
type EntityGet<TSchema extends AnyEntityESchema> = (
  key: Record<string, unknown>,
) => Effect.Effect<
  EntityType<ESchemaType<TSchema>> | null,
  SQLiteError,
  SQLiteDatabase
>;

export class EntityWriter<
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

  insert = (value: InsertInput<ESchemaType<TSchema>>) =>
    Effect.gen({ self: this }, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;
      const { item, meta } = yield* this.#preparation.prepareInsert(fullValue);

      yield* this.#table.putItem(item).pipe(
        Effect.catch((error) =>
          this.#get(fullValue).pipe(
            Effect.catch(() => Effect.succeed(null)),
            Effect.flatMap((existing) =>
              Effect.fail(
                existing
                  ? SQLiteError.itemAlreadyExists(this.#table.tableName, error)
                  : error,
              ),
            ),
          ),
        ),
      );

      const entity = { value: fullValue, meta };
      yield* this.#broadcast([entity]);
      return entity;
    }).pipe(
      Effect.withSpan('sqlite.entity.insert', {
        attributes: { entity: this.#eschema.name },
      }),
    );

  getAndUpdate = (
    keyValue: Record<string, unknown>,
    update: UpdateInput<ESchemaType<TSchema>>,
    config?: { retries?: number; lastWriteWins?: boolean },
  ) =>
    Effect.gen({ self: this }, function* () {
      const retries = config?.retries ?? 3;
      for (let attempt = 0; ; attempt++) {
        const existing = yield* this.#get(keyValue);
        if (!existing) {
          return yield* Effect.fail(
            SQLiteError.noItemToUpdate(this.#table.tableName),
          );
        }

        const partial =
          typeof update === 'function' ? update(existing.value) : update;
        if (partial === null) return existing;

        const fullValue = {
          ...existing.value,
          ...partial,
        } as ESchemaType<TSchema>;
        const { encoded, meta } = yield* this.#preparation.encode(
          fullValue,
          existing.meta._d,
        );
        const key = this.#index.derivePrimary(keyValue);
        const values = {
          _data: JSON.stringify(encoded),
          _v: meta._v,
          _u: meta._u,
          ...this.#index.deriveSecondary({ ...fullValue, _u: meta._u }),
        };

        if (config?.lastWriteWins) {
          yield* this.#table.updateItem(key, values);
        } else {
          const database = yield* SQLiteDatabase;
          const where = Sql.whereAnd(
            Sql.wherePkSkExact(
              this.#table.primary.pk,
              this.#table.primary.sk,
              key.pk,
              key.sk,
            ),
            Sql.where('_u', '=', existing.meta._u),
          );
          const { rowsWritten } = yield* database.update(
            this.#table.tableName,
            values,
            where,
          );
          if (rowsWritten === 0) {
            if (attempt < retries) continue;
            return yield* Effect.fail(
              SQLiteError.conditionFailed(this.#table.tableName, key),
            );
          }
        }

        const entity = { value: fullValue, meta };
        yield* this.#broadcast([entity]);
        return entity;
      }
    }).pipe(
      Effect.withSpan('sqlite.entity.get-and-update', {
        attributes: { entity: this.#eschema.name },
      }),
    );

  delete = (keyValue: Record<string, unknown>) =>
    Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SQLiteError.noItemToDelete(this.#table.tableName),
        );
      }
      const { encoded, meta } = yield* this.#preparation.encode(
        existing.value,
        true,
      );
      const key = this.#index.derivePrimary(keyValue);
      yield* this.#table.updateItem(key, {
        _data: JSON.stringify(encoded),
        _v: meta._v,
        _u: meta._u,
        _d: 1,
        ...this.#index.deriveSecondary({ ...existing.value, _u: meta._u }),
      });
      const entity = { value: existing.value, meta };
      yield* this.#broadcast([entity]);
      return entity;
    }).pipe(
      Effect.withSpan('sqlite.entity.delete', {
        attributes: { entity: this.#eschema.name },
      }),
    );

  restore = (keyValue: Record<string, unknown>) =>
    Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SQLiteError.noItemToRestore(this.#table.tableName),
        );
      }
      if (!existing.meta._d) return existing;

      const { encoded, meta } = yield* this.#preparation.encode(
        existing.value,
        false,
      );
      const key = this.#index.derivePrimary(keyValue);
      const database = yield* SQLiteDatabase;
      const where = Sql.whereAnd(
        Sql.wherePkSkExact(
          this.#table.primary.pk,
          this.#table.primary.sk,
          key.pk,
          key.sk,
        ),
        Sql.where('_u', '=', existing.meta._u),
      );
      const { rowsWritten } = yield* database.update(
        this.#table.tableName,
        {
          _data: JSON.stringify(encoded),
          _v: meta._v,
          _u: meta._u,
          _d: 0,
          ...this.#index.deriveSecondary({ ...existing.value, _u: meta._u }),
        },
        where,
      );
      if (rowsWritten === 0) {
        return yield* Effect.fail(
          SQLiteError.conditionFailed(this.#table.tableName, key),
        );
      }
      const entity = { value: existing.value, meta };
      yield* this.#broadcast([entity]);
      return entity;
    }).pipe(
      Effect.withSpan('sqlite.entity.restore', {
        attributes: { entity: this.#eschema.name },
      }),
    );

  hardDelete = (
    keyValue: Record<string, unknown>,
    _: 'I KNOW WHAT I AM DOING',
  ) =>
    Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SQLiteError.noItemToDelete(this.#table.tableName),
        );
      }
      const key = this.#index.derivePrimary(keyValue);
      const { rowsDeleted } = yield* this.#table.delete(
        Sql.wherePkSkExact(
          this.#table.primary.pk,
          this.#table.primary.sk,
          key.pk,
          key.sk,
        ),
      );
      if (rowsDeleted === 0) {
        return yield* Effect.fail(
          SQLiteError.noItemToDelete(this.#table.tableName),
        );
      }
      const deleted = {
        value: existing.value,
        meta: { ...existing.meta, _d: true as const },
      };
      yield* this.#broadcast([deleted]);
      return deleted;
    }).pipe(
      Effect.withSpan('sqlite.entity.hard-delete', {
        attributes: { entity: this.#eschema.name },
      }),
    );

  dangerouslyRemoveAllItems = (_: 'I KNOW WHAT I AM DOING') =>
    this.#table.dangerouslyRemoveEntityItems(
      this.#eschema.name,
      'I KNOW WHAT I AM DOING',
    );

  #broadcast(entities: EntityType<ESchemaType<TSchema>>[]) {
    return Effect.gen(function* () {
      const service = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );
      service?.broadcast(entities);
    });
  }
}
