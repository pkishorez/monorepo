import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect } from 'effect';
import type { EntityType } from '../../../../../core/index.js';
import {
  IdbDB,
  IdbDBError,
  type IdbWriteOp,
} from '../../idb-database/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { IdbEntityTable } from '../entity-table.js';
import type { IdbEntityOp } from '../idb-entity.js';
import type { EntityWritePreparation } from './write-preparation.js';

type InsertInput<T> = Omit<T, '_v'>;
type UpdateInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>>);
type EntityGet<TSchema extends AnyEntityESchema> = (
  key: Record<string, unknown>,
) => Effect.Effect<EntityType<ESchemaType<TSchema>> | null, IdbDBError, IdbDB>;

export class EntityTransaction<
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

  insertOp = (
    value: InsertInput<ESchemaType<TSchema>>,
  ): Effect.Effect<IdbEntityOp<ESchemaType<TSchema>>, IdbDBError, IdbDB> =>
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
      return {
        entityName: this.#eschema.name,
        operationKind: 'insertOp',
        pk: record.pk,
        sk: record.sk,
        table: this.#table,
        apply: (u) => {
          const valueWithMeta = { ...fullValue, _u: u };
          return {
            write: {
              type: 'put',
              record: {
                ...record,
                ...this.#index.derivePrimary(valueWithMeta),
                _u: u,
                ...this.#index.deriveSecondary(valueWithMeta),
              },
              expectedU: null,
            } satisfies IdbWriteOp,
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
        const _database = yield* IdbDB;
        return yield* Effect.fail(
          IdbDBError.noItemToUpdate(this.#table.storeName),
        );
      }
      const value = {
        ...existing.value,
        ...(typeof update === 'function' ? update(existing.value) : update),
      } as ESchemaType<TSchema>;
      return yield* this.#buildPutOp(
        keyValue,
        value,
        existing.meta._d,
        options?.lastWriteWins ? undefined : existing.meta._u,
        'updateOp',
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
        const _database = yield* IdbDB;
        return yield* Effect.fail(
          deleted
            ? IdbDBError.noItemToDelete(this.#table.storeName)
            : IdbDBError.noItemToRestore(this.#table.storeName),
        );
      }
      return yield* this.#buildPutOp(
        keyValue,
        existing.value,
        deleted,
        options?.lastWriteWins ? undefined : existing.meta._u,
        deleted ? 'deleteOp' : 'restoreOp',
      );
    });
  }

  #buildPutOp(
    keyValue: Record<string, unknown>,
    value: ESchemaType<TSchema>,
    deleted: boolean,
    expectedU: string | undefined,
    operationKind: IdbEntityOp['operationKind'],
  ) {
    return Effect.gen({ self: this }, function* () {
      const { record, meta } = yield* this.#preparation.prepareRecord(
        value,
        deleted,
        keyValue,
      );
      return {
        entityName: this.#eschema.name,
        operationKind,
        pk: record.pk,
        sk: record.sk,
        table: this.#table,
        apply: (u: string) => ({
          write: {
            type: 'put',
            record: {
              ...record,
              _u: u,
              ...this.#index.deriveSecondary({ ...value, _u: u }),
            },
            ...(expectedU === undefined ? {} : { expectedU }),
          } satisfies IdbWriteOp,
          entity: { value, meta: { ...meta, _u: u } },
        }),
      } satisfies IdbEntityOp<ESchemaType<TSchema>>;
    });
  }
}
