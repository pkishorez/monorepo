import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect, Match, Schema } from 'effect';
import {
  exprCondition,
  type AnyOperation,
  type ConditionInput,
  type UpdateOps,
} from '../../../domain/expression/index.js';
import { buildExpr } from '../../../domain/expression/index.js';
import type { IndexPkValue, TransactItem } from '../../../types/index.js';
import type { EntityTable as DynamoTable } from '../../../domain/entity-persistence/index.js';
import type { DynamoDB } from '../../dynamodb/index.js';
import { DynamoDBError } from '../../dynamodb-error/index.js';
import { EntityIndex, type StoredIndexDerivation } from '../entity-index.js';
import type { EntityWriter } from './write.js';

const metaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _u: Schema.String,
  _d: Schema.Boolean,
});

type MetaType = typeof metaSchema.Type;
interface EntityType<T> {
  value: T;
  meta: MetaType;
}
type InsertInput<T> = Omit<T, '_v'>;
type UpdateOpInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>>);

export class EntityTransaction<
  TTable extends DynamoTable<any, any>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
> {
  readonly #table: TTable;
  readonly #eschema: TSchema;
  readonly #index: EntityIndex<TSecondaryDerivationMap>;
  readonly #get: (
    keyValue: any,
    options?: { ConsistentRead?: boolean },
  ) => Effect.Effect<
    EntityType<ESchemaType<TSchema>> | null,
    DynamoDBError,
    DynamoDB
  >;
  readonly #writer: EntityWriter<
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
    writer: EntityWriter<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#index = index;
    this.#get = get;
    this.#writer = writer;
  }

  insertOp = (
    value: InsertInput<ESchemaType<TSchema>>,
    options?: {
      condition?: ConditionInput<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<TransactItem, DynamoDBError, DynamoDB> => {
    return Effect.gen({ self: this }, function* () {
      const fullValueWithId = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const { exprResult, fullValue, restamp } =
        yield* this.#writer.preparation.prepareInsert(
          fullValueWithId,
          options?.condition,
        );
      const { pk, sk } = this.#index.primaryKey(fullValueWithId);

      return {
        entityName: this.#eschema.name,
        operationKind: 'insertOp',
        pk,
        sk,
        table: this.#table,
        apply: (u) => {
          const { item, meta } = restamp(u);
          return {
            ...this.#table.opPutItem(item, exprResult),
            broadcast: { value: fullValue, meta },
          };
        },
      } satisfies TransactItem;
    });
  };

  /**
   * Creates an update operation for use in a transaction.
   * Pre-fetches the existing entity to include complete broadcast data.
   *
   * @param keyValue - Object containing the primary key field values
   * @param params - Object containing the update and optional condition
   * @param params.update - Partial entity or expression builder callback
   * @param params.condition - Optional condition expression
   * @returns A transaction item for update with broadcast data
   */
  updateOp = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    params: {
      update:
        | Partial<Omit<ESchemaType<TSchema>, '_v'>>
        | ((
            ops: UpdateOps<ESchemaType<TSchema>>,
          ) => AnyOperation<ESchemaType<TSchema>>[]);
      condition?: ConditionInput<ESchemaType<TSchema>>;
      lastWriteWins?: boolean;
    },
  ): Effect.Effect<TransactItem, DynamoDBError, DynamoDB> => {
    const { update: updates, condition } = params;
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue, { ConsistentRead: true });
      return yield* Match.value(existing ? 'found' : 'missing').pipe(
        Match.when('missing', () =>
          Effect.fail(DynamoDBError.noItemToUpdate()),
        ),
        Match.when('found', () =>
          Effect.gen({ self: this }, function* () {
            const current = existing!;
            const expectedU = params.lastWriteWins
              ? undefined
              : current.meta._u;
            const { pk, sk, restamp } =
              typeof updates === 'function'
                ? yield* this.#writer.preparation.prepareUpdateExpr(
                    keyValue as Record<string, unknown>,
                    updates,
                    condition,
                    expectedU,
                    current.meta._d,
                  )
                : yield* this.#writer.preparation.prepareUpdate(
                    keyValue as Record<string, unknown>,
                    updates,
                    condition,
                    expectedU,
                    current.meta._d,
                  );
            const mergedValue =
              typeof updates === 'function'
                ? current.value
                : ({
                    ...current.value,
                    ...updates,
                  } as ESchemaType<TSchema>);
            return {
              entityName: this.#eschema.name,
              operationKind: 'updateOp',
              pk,
              sk,
              table: this.#table,
              apply: (u) => {
                const { exprResult, meta } = restamp(u);
                return {
                  ...this.#table.opUpdateItem({ pk, sk }, exprResult),
                  broadcast: { value: mergedValue, meta },
                };
              },
            } satisfies TransactItem;
          }),
        ),
        Match.exhaustive,
      );
    });
  };

  /**
   * The portable read-modify-write (see db ADR 0002): reads the current
   * entity, derives a partial from it, and writes the full merged record back
   * as a `PutItem` guarded on the `_u` that was read. On a concurrent-write
   * conflict, re-reads and re-runs up to `retries` times (default 3) before
   * failing with `conditionCheckFailed`. A callback returning `null` skips
   * the write and resolves with the current entity. `lastWriteWins: true`
   * drops the guard. Costs two round-trips where the native `update` costs
   * one — prefer `update` for Dynamo-only latency-sensitive code.
   *
   * @param keyValue - Object containing the primary key field values
   * @param update - Partial entity, or a callback deriving one from the current value
   * @param config - Retry count and guard opt-out
   * @returns The updated entity with new metadata
   */
  getAndUpdateOp = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    update: UpdateOpInput<ESchemaType<TSchema>>,
    config?: { lastWriteWins?: boolean },
  ): Effect.Effect<TransactItem, DynamoDBError, DynamoDB> => {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue, { ConsistentRead: true });
      return yield* Match.value(existing ? 'found' : 'missing').pipe(
        Match.when('missing', () =>
          Effect.fail(DynamoDBError.noItemToUpdate()),
        ),
        Match.when('found', () =>
          Effect.gen({ self: this }, function* () {
            const current = existing!;
            const fullValue = {
              ...current.value,
              ...(typeof update === 'function'
                ? update(current.value)
                : update),
            } as ESchemaType<TSchema>;
            const idField = this.#eschema.idField;
            if (!Object.is(fullValue[idField], current.value[idField])) {
              return yield* Effect.fail(
                DynamoDBError.idUpdateNotSupported(idField),
              );
            }
            const encoded = yield* this.#eschema
              .encode(fullValue as any)
              .pipe(Effect.mapError((e) => DynamoDBError.putItemFailed(e)));
            const exprResult = config?.lastWriteWins
              ? undefined
              : buildExpr({
                  condition: exprCondition(($) =>
                    $.cond('_u' as any, '=', current.meta._u),
                  ),
                });
            const { pk, sk } = this.#index.primaryKey({
              ...keyValue,
              _u: current.meta._u,
            });
            return {
              entityName: this.#eschema.name,
              operationKind: 'updateOp',
              pk,
              sk,
              table: this.#table,
              apply: (u) => {
                const meta: MetaType = {
                  _e: this.#eschema.name,
                  _v: this.#eschema.latestVersion,
                  _u: u,
                  _d: current.meta._d,
                };
                const valueWithMeta = { ...fullValue, _u: u };
                const item = {
                  ...encoded,
                  ...meta,
                  [this.#table.primary.pk]: pk,
                  [this.#table.primary.sk]: sk,
                  ...this.#index.secondaryAttributes(valueWithMeta),
                };
                return {
                  ...this.#table.opPutItem(item, exprResult),
                  broadcast: { value: fullValue, meta },
                };
              },
            } satisfies TransactItem;
          }),
        ),
        Match.exhaustive,
      );
    });
  };

  deleteOp = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<TransactItem, DynamoDBError, DynamoDB> =>
    this.#buildTombstoneOp(keyValue, true, options);

  restoreOp = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<TransactItem, DynamoDBError, DynamoDB> =>
    this.#buildTombstoneOp(keyValue, false, options);

  #buildTombstoneOp(
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    deleted: boolean,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<TransactItem, DynamoDBError, DynamoDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue, { ConsistentRead: true });
      if (!existing) {
        return yield* Effect.fail(
          deleted
            ? DynamoDBError.noItemToDelete()
            : DynamoDBError.noItemToRestore(),
        );
      }

      const { pk, sk, restamp } = yield* this.#writer.preparation.prepareUpdate(
        keyValue as Record<string, unknown>,
        { _d: deleted } as any,
        undefined,
        options?.lastWriteWins ? undefined : existing.meta._u,
        existing.meta._d,
      );

      return {
        entityName: this.#eschema.name,
        operationKind: deleted ? 'deleteOp' : 'restoreOp',
        pk,
        sk,
        table: this.#table,
        apply: (u) => {
          const { exprResult, meta } = restamp(u);
          return {
            ...this.#table.opUpdateItem({ pk, sk }, exprResult),
            broadcast: { value: existing.value, meta },
          };
        },
      } satisfies TransactItem;
    });
  }

  /**
   * Queries entities using the primary index or a secondary index.
   * Scan direction is determined by operator (>=, > = ascending; <=, < = descending).
   * Value can be null (all items) or a cursor value (from/to that point).
   *
   * @param key - "primary" for primary index, or the secondary index name
   * @param params - Query parameters with pk and sk (required)
   * @param options - Query options including limit
   * @returns Array of matching entities with metadata
   */
}
