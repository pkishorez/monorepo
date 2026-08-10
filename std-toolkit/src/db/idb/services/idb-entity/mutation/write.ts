import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect, Option } from 'effect';
import {
  Broadcaster,
  nextUlid,
  type EntityType,
} from '../../../../../core/index.js';
import { IdbDB, IdbDBError } from '../../idb-database/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { IdbEntityTable } from '../entity-table.js';
import type { EntityWritePreparation } from './write-preparation.js';

type InsertInput<T> = Omit<T, '_v'>;
type UpdateInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>> | null);
type EntityGet<TSchema extends AnyEntityESchema> = (
  key: Record<string, unknown>,
) => Effect.Effect<EntityType<ESchemaType<TSchema>> | null, IdbDBError, IdbDB>;

export class EntityWriter<
  TTable extends IdbEntityTable,
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
      const { record, meta } = yield* this.#preparation.prepareRecord(
        fullValue,
        false,
        fullValue,
      );
      const u = yield* nextUlid;
      const valueWithMeta = { ...fullValue, _u: u };
      const finalRecord = {
        ...record,
        ...this.#index.derivePrimary(valueWithMeta),
        _u: u,
        ...this.#index.deriveSecondary(valueWithMeta),
      };
      const database = yield* IdbDB;
      yield* database
        .transact(this.#table.storeName, [
          { type: 'put', record: finalRecord, expectedU: null },
        ])
        .pipe(
          Effect.mapError((error) =>
            error._tag === 'ConditionFailed'
              ? IdbDBError.itemAlreadyExists(this.#table.storeName, error)
              : error,
          ),
        );
      const entity = { value: fullValue, meta: { ...meta, _u: u } };
      yield* this.#broadcast([entity]);
      return entity;
    }).pipe(
      Effect.withSpan('idb.entity.insert', {
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
          const _database = yield* IdbDB;
          return yield* Effect.fail(
            IdbDBError.noItemToUpdate(this.#table.storeName),
          );
        }
        const partial =
          typeof update === 'function' ? update(existing.value) : update;
        if (partial === null) return existing;
        const value = { ...existing.value, ...partial } as ESchemaType<TSchema>;
        const { record, meta } = yield* this.#preparation.prepareRecord(
          value,
          existing.meta._d,
          keyValue,
        );
        const database = yield* IdbDB;
        const conflicted = yield* database
          .transact(this.#table.storeName, [
            {
              type: 'put',
              record,
              ...(config?.lastWriteWins ? {} : { expectedU: existing.meta._u }),
            },
          ])
          .pipe(
            Effect.as(false),
            Effect.catchIf(
              (error) => error._tag === 'ConditionFailed',
              () => Effect.succeed(true),
            ),
          );
        if (conflicted) {
          if (attempt < retries) continue;
          return yield* Effect.fail(
            IdbDBError.conditionFailed(this.#table.storeName, record),
          );
        }
        const entity = { value, meta };
        yield* this.#broadcast([entity]);
        return entity;
      }
    }).pipe(
      Effect.withSpan('idb.entity.get-and-update', {
        attributes: { entity: this.#eschema.name },
      }),
    );

  delete = (keyValue: Record<string, unknown>) =>
    this.#writeTombstone(keyValue, true);

  restore = (keyValue: Record<string, unknown>) =>
    this.#writeTombstone(keyValue, false);

  hardDelete = (
    keyValue: Record<string, unknown>,
    _: 'I KNOW WHAT I AM DOING',
  ) =>
    Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue);
      if (!existing) {
        const _database = yield* IdbDB;
        return yield* Effect.fail(
          IdbDBError.noItemToDelete(this.#table.storeName),
        );
      }
      yield* this.#table.hardDeleteItem(this.#index.derivePrimary(keyValue));
      const deleted = {
        value: existing.value,
        meta: { ...existing.meta, _d: true as const },
      };
      yield* this.#broadcast([deleted]);
      return deleted;
    }).pipe(
      Effect.withSpan('idb.entity.hard-delete', {
        attributes: { entity: this.#eschema.name },
      }),
    );

  dangerouslyRemoveAllItems = (_: 'I KNOW WHAT I AM DOING') =>
    this.#table.dangerouslyRemoveEntityItems(
      this.#eschema.name,
      'I KNOW WHAT I AM DOING',
    );

  #writeTombstone(keyValue: Record<string, unknown>, deleted: boolean) {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue);
      if (!existing) {
        const _database = yield* IdbDB;
        return yield* Effect.fail(
          deleted
            ? IdbDBError.noItemToDelete(this.#table.storeName)
            : IdbDBError.noItemToRestore(this.#table.storeName),
        );
      }
      if (!deleted && !existing.meta._d) return existing;
      const { record, meta } = yield* this.#preparation.prepareRecord(
        existing.value,
        deleted,
        keyValue,
      );
      const database = yield* IdbDB;
      yield* database.transact(this.#table.storeName, [
        { type: 'put', record, expectedU: existing.meta._u },
      ]);
      const entity = { value: existing.value, meta };
      yield* this.#broadcast([entity]);
      return entity;
    }).pipe(
      Effect.withSpan(deleted ? 'idb.entity.delete' : 'idb.entity.restore', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  #broadcast(entities: EntityType<ESchemaType<TSchema>>[]) {
    return Effect.gen(function* () {
      const service = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );
      service?.broadcast(entities);
    });
  }
}
