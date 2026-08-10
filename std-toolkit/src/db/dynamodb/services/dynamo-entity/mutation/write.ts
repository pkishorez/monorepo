import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect, Option, Schema, Match } from 'effect';

import type { EntityTable as DynamoTable } from '../../../domain/entity-persistence/index.js';
import type { DynamoDB } from '../../dynamodb/index.js';
import { Broadcaster, nextUlid } from '../../../../../core/index.js';
import {
  DynamoDBError,
  isConditionalCheckFailed,
} from '../../../domain/dynamodb-error/index.js';
import type { IndexPkValue } from '../../../types/index.js';
import { deriveIndexKeyValue } from '../../../domain/entity-persistence/index.js';
import {
  exprCondition,
  type AnyOperation,
  type ConditionInput,
  type UpdateOps,
} from '../../../domain/expression/index.js';
import { buildExpr } from '../../../domain/expression/index.js';
import { EntityIndex, type StoredIndexDerivation } from '../entity-index.js';
import type { EntityType } from '../dynamo-entity.js';
import { EntityWritePreparation } from './write-preparation.js';

/**
 * Schema for entity metadata stored with each item.
 */
const metaSchema = Schema.Struct({
  /** Entity name */
  _e: Schema.String,
  /** Schema version */
  _v: Schema.String,
  /** Monotonic ULID that changes on every write */
  _u: Schema.String,
  /** Soft delete flag */
  _d: Schema.Boolean,
});

/**
 * Type for entity metadata.
 */
type MetaType = typeof metaSchema.Type;

/**
 * Represents an entity item with its value and metadata.
 *
 * @typeParam T - The entity value type
 */
/**
 * Input type for insert operations. Omits the internal `_v` field.
 */
type InsertInput<T> = Omit<T, '_v'>;

/**
 * Update input for `getAndUpdate`: a plain partial, or a callback deriving the
 * partial from the current value. Returning `null` skips the write.
 */
type UpdateInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>> | null);

/** Config for `getAndUpdate`. `retries` counts retry attempts after the first try. */
export class EntityWriter<
  TTable extends DynamoTable<any, any>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
> {
  readonly #table: TTable;
  readonly #eschema: TSchema;
  readonly #index: EntityIndex<TSecondaryDerivationMap>;
  readonly preparation: EntityWritePreparation<
    TTable,
    TSecondaryDerivationMap,
    TSchema
  >;
  readonly #get: (
    keyValue: any,
    options?: { ConsistentRead?: boolean },
  ) => Effect.Effect<
    EntityType<ESchemaType<TSchema>> | null,
    DynamoDBError,
    DynamoDB
  >;

  #broadcast(entities: EntityType<ESchemaType<TSchema>>[]) {
    return Effect.gen({ self: this }, function* () {
      const service = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );
      service?.broadcast(entities);
    });
  }

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
    this.#table = table;
    this.#eschema = eschema;
    this.#index = index;
    this.preparation = new EntityWritePreparation(table, eschema, index);
    this.#get = get;
  }

  insert = (
    value: InsertInput<ESchemaType<TSchema>>,
    options?: {
      condition?: ConditionInput<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  > => {
    return Effect.gen({ self: this }, function* () {
      const fullValueWithId = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const { exprResult, fullValue, restamp } =
        yield* this.preparation.prepareInsert(
          fullValueWithId,
          options?.condition,
        );
      const { item, meta } = restamp(yield* nextUlid);

      yield* this.#table
        .putItem(item, { ReturnValues: 'ALL_OLD', ...exprResult })
        .pipe(
          Effect.catchIf(
            (e): e is DynamoDBError =>
              e._tag === 'PutItemFailed' && isConditionalCheckFailed(e),
            (error) =>
              Effect.fail(DynamoDBError.itemAlreadyExists(error.cause)),
          ),
        );

      const entity = { value: fullValue, meta };
      yield* this.#broadcast([entity]);
      return entity;
    }).pipe(
      Effect.withSpan('dynamodb.entity.insert', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  };

  batchInsert = (
    values: InsertInput<ESchemaType<TSchema>>[],
  ): Effect.Effect<
    {
      written: EntityType<ESchemaType<TSchema>>[];
      unprocessedIndexes: number[];
    },
    DynamoDBError,
    DynamoDB
  > => {
    return Effect.gen({ self: this }, function* () {
      const prepared = yield* Effect.forEach(values, (value) =>
        Effect.gen({ self: this }, function* () {
          const fullValue = {
            ...value,
            _v: this.#eschema.latestVersion,
          } as unknown as ESchemaType<TSchema>;
          const item = yield* this.preparation.prepareInsert(fullValue);
          const stamped = item.restamp(yield* nextUlid);
          return {
            item: stamped.item,
            entity: { value: item.fullValue, meta: stamped.meta },
          };
        }),
      );
      const items = prepared.map(({ item }) => item);
      const entities = prepared.map(({ entity }) => entity);
      const { unprocessedIndexes } = yield* this.#table.batchWrite(items);
      const failed = new Set(unprocessedIndexes);
      const written = entities.filter((_, i) => !failed.has(i));
      yield* Effect.suspend(() =>
        written.length > 0 ? this.#broadcast(written) : Effect.void,
      );
      return { written, unprocessedIndexes };
    }).pipe(
      Effect.withSpan('dynamodb.entity.batch-insert', {
        attributes: {
          entity: this.#eschema.name,
          itemCount: values.length,
        },
      }),
    );
  };

  /**
   * Updates an existing entity by its primary key.
   * Accepts either a plain partial object or an expression builder callback.
   *
   * @param keyValue - Object containing the primary key field values
   * @param params - Object containing the update and optional condition
   * @param params.update - Partial entity or expression builder callback
   * @param params.condition - Optional condition expression
   * @returns The updated entity with new metadata
   */
  update = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    params: {
      update:
        | Partial<Omit<ESchemaType<TSchema>, '_v'>>
        | ((
            ops: UpdateOps<ESchemaType<TSchema>>,
          ) => AnyOperation<ESchemaType<TSchema>>[]);
      condition?: ConditionInput<ESchemaType<TSchema>>;
      autoMigrate?: boolean;
    },
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  > => {
    const { update: updates, condition, autoMigrate = true } = params;
    return Effect.gen({ self: this }, function* () {
      const { pk, sk, restamp } = yield* Match.value(
        typeof updates === 'function' ? 'expression' : 'partial',
      ).pipe(
        Match.when('expression', () =>
          this.preparation.prepareUpdateExpr(
            keyValue as Record<string, unknown>,
            updates as any,
            condition,
          ),
        ),
        Match.when('partial', () =>
          this.preparation.prepareUpdate(
            keyValue as Record<string, unknown>,
            updates as any,
            condition,
          ),
        ),
        Match.exhaustive,
      );
      const { exprResult } = restamp(yield* nextUlid);

      const attemptUpdate = () =>
        this.#table.updateItem(
          { pk, sk },
          {
            ReturnValues: 'ALL_NEW',
            ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
            ...exprResult,
          },
        );
      const resultOrRetry = yield* attemptUpdate().pipe(
        Effect.catchIf(
          (e): e is DynamoDBError =>
            e._tag === 'UpdateItemFailed' && isConditionalCheckFailed(e),
          (e) =>
            this.preparation.handleConditionFailure(e, autoMigrate, condition),
        ),
      );
      const completedResult = resultOrRetry as {
        Attributes: Record<string, unknown> | null;
      };
      const result = yield* Match.value('_retry' in resultOrRetry).pipe(
        Match.when(true, () =>
          attemptUpdate().pipe(
            Effect.mapError((error) =>
              this.preparation.mapRetryUpdateError(
                error,
                condition !== undefined,
              ),
            ),
          ),
        ),
        Match.when(false, () => Effect.succeed(completedResult)),
        Match.exhaustive,
      );
      return yield* Effect.gen({ self: this }, function* () {
        if (!result.Attributes) {
          return yield* Effect.fail(DynamoDBError.noItemToUpdate());
        }
        const decodedValue = yield* this.#eschema
          .decode(result.Attributes)
          .pipe(Effect.mapError((e) => DynamoDBError.updateItemFailed(e)));
        const entity = {
          value: decodedValue as ESchemaType<TSchema>,
          meta: Schema.decodeUnknownSync(metaSchema)(result.Attributes),
        };
        yield* this.#broadcast([entity]);
        return entity;
      });
    }).pipe(
      Effect.withSpan('dynamodb.entity.update', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  };

  delete = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  > => {
    return Effect.gen({ self: this }, function* () {
      yield* Effect.void;
      const existing = yield* this.#get(keyValue);

      return yield* Match.value(!existing ? 'missing' : 'tombstone').pipe(
        Match.when('missing', () =>
          Effect.fail(DynamoDBError.noItemToDelete()),
        ),
        Match.when('tombstone', () =>
          Effect.gen({ self: this }, function* () {
            yield* Effect.void;
            return yield* this.update(keyValue, {
              update: { _d: true } as any,
            });
          }),
        ),
        Match.exhaustive,
      );
    }).pipe(
      Effect.withSpan('dynamodb.entity.delete', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  };

  hardDelete = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    _: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, DynamoDBError, DynamoDB> =>
    Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue);
      if (!existing) {
        return yield* Effect.fail(DynamoDBError.noItemToDelete());
      }
      const pk = deriveIndexKeyValue(
        this.#eschema.name,
        this.#index.primary.pkDeps,
        keyValue as Record<string, unknown>,
        true,
      );
      const sk = deriveIndexKeyValue(
        this.#eschema.name,
        this.#index.primary.skDeps,
        keyValue as Record<string, unknown>,
        false,
      );
      yield* this.#table.deleteItem({ pk, sk });
      const deleted = {
        value: existing.value,
        meta: { ...existing.meta, _d: true as const },
      };
      yield* this.#broadcast([deleted]);
      return deleted;
    }).pipe(
      Effect.withSpan('dynamodb.entity.hard-delete', {
        attributes: { entity: this.#eschema.name },
      }),
    );

  dangerouslyRemoveAllItems = (_: 'I KNOW WHAT I AM DOING') =>
    this.#table.dangerouslyRemoveEntityItems(
      this.#eschema.name,
      'I KNOW WHAT I AM DOING',
    );

  /**
   * Restores a soft-deleted entity with a fresh `_u` so sync consumers see it
   * become live again.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The restored entity
   */
  restore = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  > => {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.#get(keyValue);

      return yield* Match.value(
        !existing ? 'missing' : existing.meta._d ? 'tombstone' : 'live',
      ).pipe(
        Match.when('missing', () =>
          Effect.fail(DynamoDBError.noItemToRestore()),
        ),
        Match.when('live', () => Effect.succeed(existing!)),
        Match.when('tombstone', () =>
          this.update(keyValue, {
            update: { _d: false } as any,
          }),
        ),
        Match.exhaustive,
      );
    }).pipe(
      Effect.withSpan('dynamodb.entity.restore', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  };

  /**
   * Creates an insert operation for use in a transaction.
   * Includes broadcast data for emitting changes after successful transaction.
   *
   * @param value - The entity value to insert
   * @param options - Insert options including condition
   * @returns A transaction item for insert with broadcast data
   */
  getAndUpdate = (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    update: UpdateInput<ESchemaType<TSchema>>,
    config?: { retries?: number; lastWriteWins?: boolean },
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  > => {
    const retries = config?.retries ?? 3;
    const attemptUpdate = (
      attempt: number,
    ): Effect.Effect<
      EntityType<ESchemaType<TSchema>>,
      DynamoDBError,
      DynamoDB
    > =>
      Effect.gen({ self: this }, function* () {
        const existing = yield* this.#get(keyValue, {
          ConsistentRead: true,
        });
        return yield* Match.value(existing ? 'found' : 'missing').pipe(
          Match.when('missing', () =>
            Effect.fail(DynamoDBError.noItemToUpdate()),
          ),
          Match.when('found', () =>
            Effect.gen({ self: this }, function* () {
              const current = existing!;
              const partial = this.#resolveUpdateInput(update, current.value);
              return yield* Match.value(
                partial === null ? 'skip' : 'write',
              ).pipe(
                Match.when('skip', () => Effect.succeed(current)),
                Match.when('write', () =>
                  Effect.gen({ self: this }, function* () {
                    const { fullValue, item, _u } = yield* Effect.gen(
                      { self: this },
                      function* () {
                        const fullValue = {
                          ...current.value,
                          ...partial!,
                        } as ESchemaType<TSchema>;
                        const idField = this.#eschema.idField;
                        if (
                          !Object.is(fullValue[idField], current.value[idField])
                        ) {
                          return yield* Effect.fail(
                            DynamoDBError.idUpdateNotSupported(idField),
                          );
                        }
                        const _u = yield* nextUlid;
                        const canonical =
                          yield* this.preparation.canonicalizeDecodedValue(
                            fullValue,
                            { _d: current.meta._d },
                            _u,
                          );
                        const originalKey = this.#index.primaryKey({
                          ...keyValue,
                          _u,
                        });
                        return {
                          fullValue,
                          _u,
                          item: {
                            ...canonical.item,
                            [this.#table.primary.pk]: originalKey.pk,
                            [this.#table.primary.sk]: originalKey.sk,
                          },
                        };
                      },
                    );
                    const exprResult = yield* Effect.sync(() =>
                      config?.lastWriteWins
                        ? undefined
                        : buildExpr({
                            condition: exprCondition(($) =>
                              $.cond('_u' as any, '=', current.meta._u),
                            ),
                          }),
                    );
                    const conflict = yield* this.#table
                      .putItem(item, exprResult)
                      .pipe(
                        Effect.as(null),
                        Effect.catchIf(
                          (e): e is DynamoDBError =>
                            e._tag === 'PutItemFailed' &&
                            isConditionalCheckFailed(e),
                          (error) => Effect.succeed(error),
                        ),
                      );
                    return yield* Match.value(
                      conflict === null
                        ? 'written'
                        : attempt < retries
                          ? 'retry'
                          : 'exhausted',
                    ).pipe(
                      Match.when('written', () =>
                        Effect.gen({ self: this }, function* () {
                          const meta: MetaType = {
                            _e: this.#eschema.name,
                            _v: this.#eschema.latestVersion,
                            _u,
                            _d: current.meta._d,
                          };
                          const entity = {
                            value: fullValue,
                            meta,
                          };
                          yield* this.#broadcast([entity]);
                          return entity;
                        }),
                      ),
                      Match.when('retry', () => attemptUpdate(attempt + 1)),
                      Match.when('exhausted', () =>
                        Effect.fail(
                          DynamoDBError.conditionCheckFailed(conflict?.cause),
                        ),
                      ),
                      Match.exhaustive,
                    );
                  }),
                ),
                Match.exhaustive,
              );
            }),
          ),
          Match.exhaustive,
        );
      });
    return attemptUpdate(0).pipe(
      Effect.withSpan('dynamodb.entity.get-and-update', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  };

  /**
   * Op form of `getAndUpdate` for use in `transact`. Pre-fetches the current
   * entity, resolves the update against it, and defers a full-record
   * `PutItem` guarded on the `_u` that was read (unless `lastWriteWins`).
   * Cannot retry — a conflict surfaces as the transaction's condition
   * failure.
   *
   * @param keyValue - Object containing the primary key field values
   * @param update - Partial entity, or a callback deriving one from the current value
   * @param config - Guard opt-out
   * @returns A transaction item for the write with broadcast data
   */
  #resolveUpdateInput(
    update: UpdateInput<ESchemaType<TSchema>>,
    current: ESchemaType<TSchema>,
  ) {
    return typeof update === 'function' ? update(current) : update;
  }
}
