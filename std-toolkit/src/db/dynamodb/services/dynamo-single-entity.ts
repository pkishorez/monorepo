import type {
  AnySingleEntityESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import { Effect, Option, Schema } from 'effect';
import { decision, exhaustive, flow, step, when } from 'laymos/story';
import type { DynamoTable } from './dynamo-table.js';
import type { DynamoDB } from './dynamo-client.js';
import type { EntityType } from '../../../core/index.js';
import { Broadcaster, nextUlid } from '../../../core/index.js';
import { DynamodbError } from '../errors.js';
import {
  deriveIndexKeyValue,
  isConditionalCheckFailed,
} from '../internal/index.js';
import { buildExpr, type UpdateExprResult } from '../expr/build-expr.js';
import {
  exprCondition,
  resolveCondition,
  type ConditionOperation,
  type ConditionInput,
} from '../expr/condition.js';
import {
  exprUpdate,
  type UpdateOps,
  type AnyOperation,
} from '../expr/update.js';
import type { TransactItem } from '../types/index.js';

/**
 * Schema for single entity metadata stored with each item.
 * No `_d` field — single entities have no soft delete concept.
 */
const singleMetaSchema = Schema.Struct({
  /** Entity name */
  _e: Schema.String,
  /** Schema version */
  _v: Schema.String,
  /** Monotonic ULID that changes on every write */
  _u: Schema.String,
});

/**
 * Type for single entity metadata.
 */
type SingleMetaType = typeof singleMetaSchema.Type;
type SingleUpdateInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>> | null);

/**
 * Represents a single entity item with its value and metadata.
 *
 * @typeParam T - The entity value type
 */
export interface SingleEntityType<T> {
  /** The entity data */
  value: T;
  /** Metadata about the entity item */
  meta: SingleMetaType;
}

/**
 * A simplified DynamoDB entity for single-record use cases (e.g., app config, feature flags, counters).
 * Provides type-safe `get`, `put`, and `update` with a mandatory default value so `get` never returns null.
 *
 * PK is always the entity name. SK is always the idField value.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TSchema - The ESchema type for this entity
 */
export class DynamoSingleEntity<
  TTable extends DynamoTable<any, any>,
  TSchema extends AnySingleEntityESchema,
> {
  /**
   * Creates a new single entity builder for the given table.
   *
   * @returns A builder to configure the entity schema
   */
  static make<TTable extends DynamoTable<any, any>>(
    table: TTable,
    onBuild?: (entity: DynamoSingleEntity<any, any>) => void,
  ) {
    return {
      /**
       * Configures the entity to use the given ESchema.
       *
       * @param eschema - The ESchema instance
       * @returns A builder to set the default value
       */
      eschema<TS extends AnySingleEntityESchema>(eschema: TS) {
        return {
          /**
           * Sets the default value and constructs the instance.
           * The default is returned by `get` when the item doesn't exist in DynamoDB.
           *
           * @param defaultValue - The default entity value
           * @returns The configured DynamoSingleEntity instance
           */
          default(defaultValue: Omit<ESchemaType<TS>, '_v'>) {
            const entity = new DynamoSingleEntity<TTable, TS>(
              table,
              eschema,
              defaultValue as ESchemaType<TS>,
            );
            onBuild?.(entity);
            return entity;
          },
        };
      },
    };
  }

  #table: TTable;
  #eschema: TSchema;
  #defaultValue: ESchemaType<TSchema>;

  constructor(
    table: TTable,
    eschema: TSchema,
    defaultValue: ESchemaType<TSchema>,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#defaultValue = defaultValue as ESchemaType<TSchema>;
  }

  /**
   * Gets the entity name from the schema.
   */
  get name(): TSchema['name'] {
    return this.#eschema.name;
  }

  #derivePrimaryKey(): string {
    return deriveIndexKeyValue(this.#eschema.name, [], {}, true);
  }

  /**
   * Retrieves the single entity.
   * Never returns null — returns the default value with synthetic meta if the item doesn't exist.
   *
   * @param options - Optional read options
   * @returns The entity, guaranteed non-null
   */
  get = flow(
    'Get singleton entity',
    {
      description:
        'Reads the stored singleton or returns its configured default value.',
    },
    (options?: {
      ConsistentRead?: boolean;
    }): Effect.Effect<
      SingleEntityType<ESchemaType<TSchema>>,
      DynamodbError,
      DynamoDB
    > => {
      return Effect.gen({ self: this }, function* () {
        const pk = this.#derivePrimaryKey();
        const sk = this.#derivePrimaryKey();

        const { Item } = yield* this.#table.getItem({ pk, sk }, options);

        return yield* decision(
          'Was a value already stored?',
          {
            description:
              'Distinguishes stored singleton state from the schema default used before the first write.',
            attributes: { entity: this.#eschema.name },
          },
          Boolean(Item),
        ).pipe(
          when(
            true,
            {
              name: 'A stored value exists',
              description:
                'Decodes the singleton value and metadata stored in DynamoDB.',
            },
            () =>
              step(
                'Decode the stored value',
                {
                  description:
                    'Decodes the stored singleton schema value and separates its metadata.',
                  visibility: 'detail',
                },
                () =>
                  this.#eschema.decode(Item!).pipe(
                    Effect.mapError((e) => DynamodbError.getItemFailed(e)),
                    Effect.map((value) => ({
                      value: value as ESchemaType<TSchema>,
                      meta: Schema.decodeUnknownSync(singleMetaSchema)(Item),
                    })),
                  ),
              ),
          ),
          when(
            false,
            {
              name: 'Use the configured default',
              description:
                'Returns the configured default with synthetic pre-write metadata.',
            },
            () =>
              Effect.succeed({
                value: this.#defaultValue,
                meta: {
                  _e: this.#eschema.name,
                  _v: this.#eschema.latestVersion,
                  _u: '',
                },
              }),
          ),
          exhaustive,
        );
      });
    },
  );

  /**
   * Unconditionally writes the entity (upsert).
   *
   * @param value - The entity value to write
   * @returns The written entity with metadata
   */
  put = flow(
    'Put singleton entity',
    {
      description: 'Validates and unconditionally stores the singleton value.',
    },
    (
      value: Omit<ESchemaType<TSchema>, '_v'>,
    ): Effect.Effect<
      SingleEntityType<ESchemaType<TSchema>>,
      DynamodbError,
      DynamoDB
    > => {
      return Effect.gen({ self: this }, function* () {
        const fullValue = {
          ...value,
          _v: this.#eschema.latestVersion,
        } as unknown as ESchemaType<TSchema>;

        const encoded = yield* step(
          'Encode the complete value',
          {
            description:
              'Validates and encodes the complete singleton value for storage.',
            visibility: 'detail',
          },
          () =>
            this.#eschema
              .encode(fullValue as any)
              .pipe(Effect.mapError((e) => DynamodbError.putItemFailed(e))),
        );

        const _u = yield* nextUlid;

        const meta: SingleMetaType = {
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
        };

        const pk = this.#derivePrimaryKey();
        const sk = this.#derivePrimaryKey();

        const item = {
          ...encoded,
          ...meta,
          [this.#table.primary.pk]: pk,
          [this.#table.primary.sk]: sk,
        };

        yield* this.#table.putItem(item);

        yield* this.#broadcast([
          {
            value: fullValue,
            meta: { ...meta, _d: false },
          },
        ]);
        return { value: fullValue, meta };
      });
    },
  );

  /**
   * Updates the single entity.
   * Fails with `NoItemToUpdate` if the item doesn't exist.
   * Accepts either a plain partial object or an expression builder callback.
   *
   * @param params - Object containing the update and optional condition
   * @returns The updated entity with new metadata
   */
  update = flow(
    'Update singleton entity',
    {
      description:
        'Applies a partial or expression update to the stored singleton.',
    },
    (params: {
      update:
        | Partial<Omit<ESchemaType<TSchema>, '_v'>>
        | ((
            ops: UpdateOps<ESchemaType<TSchema>>,
          ) => AnyOperation<ESchemaType<TSchema>>[]);
      condition?: ConditionInput<ESchemaType<TSchema>>;
    }): Effect.Effect<
      SingleEntityType<ESchemaType<TSchema>>,
      DynamodbError,
      DynamoDB
    > => {
      const { update: updates, condition } = params;
      return Effect.gen({ self: this }, function* () {
        const _u = yield* nextUlid;
        const { pk, sk, exprResult } = yield* decision(
          'How should the update be expressed?',
          {
            description:
              'Selects whether to compile a partial singleton value or a native update-expression callback.',
            attributes: { entity: this.#eschema.name },
          },
          typeof updates === 'function' ? 'expression' : 'partial',
        ).pipe(
          when(
            'expression',
            {
              name: 'Use update expressions',
              description:
                'Compiles the caller callback into DynamoDB update operations.',
            },
            () =>
              Effect.sync(() =>
                this.#prepareUpdateExpr(updates as any, _u, condition),
              ),
          ),
          when(
            'partial',
            {
              name: 'Use changed fields',
              description:
                'Encodes the supplied singleton fields into DynamoDB set operations.',
            },
            () =>
              Effect.sync(() =>
                this.#prepareUpdate(updates as any, _u, condition),
              ),
          ),
          exhaustive,
        );

        const result = yield* this.#table
          .updateItem({ pk, sk }, { ReturnValues: 'ALL_NEW', ...exprResult })
          .pipe(
            Effect.mapError(
              (e): DynamodbError => this.#mapUpdateError(e, condition),
            ),
          );

        return yield* decision(
          'Did DynamoDB return the updated singleton?',
          {
            description:
              'Returns the decoded singleton update or fails when no stored value was updated.',
            attributes: { entity: this.#eschema.name },
          },
          result.Attributes ? 'updated' : 'missing',
        ).pipe(
          when(
            'updated',
            {
              name: 'Return the updated singleton',
              description:
                'Decodes, broadcasts, and returns the freshly updated singleton.',
            },
            () =>
              Effect.gen({ self: this }, function* () {
                const { decodedValue, updatedMeta } = yield* step(
                  'Decode the updated value',
                  {
                    description:
                      'Decodes the returned singleton value and its freshly written metadata.',
                    visibility: 'detail',
                  },
                  () =>
                    this.#eschema.decode(result.Attributes!).pipe(
                      Effect.mapError((e) => DynamodbError.updateItemFailed(e)),
                      Effect.map((decodedValue) => ({
                        decodedValue,
                        updatedMeta: Schema.decodeUnknownSync(singleMetaSchema)(
                          result.Attributes,
                        ),
                      })),
                    ),
                );
                yield* this.#broadcast([
                  {
                    value: decodedValue as ESchemaType<TSchema>,
                    meta: { ...updatedMeta, _d: false },
                  },
                ]);
                return {
                  value: decodedValue as ESchemaType<TSchema>,
                  meta: updatedMeta,
                };
              }),
          ),
          when(
            'missing',
            {
              name: 'No singleton was updated',
              description:
                'Fails because no stored singleton matched the update.',
              completion: { kind: 'error', error: 'NoItemToUpdate' },
            },
            () => Effect.fail(DynamodbError.noItemToUpdate()),
          ),
          exhaustive,
        );
      });
    },
  );

  /**
   * Creates an update operation for use in a transaction.
   * Pre-fetches the existing entity to include complete broadcast data.
   *
   * @param params - Object containing the update and optional condition
   * @returns A transaction item for update with broadcast data
   */
  updateOp = flow(
    'Build singleton update operation',
    {
      description:
        'Builds a deferred singleton update for an atomic table transaction.',
    },
    (params: {
      update:
        | Partial<Omit<ESchemaType<TSchema>, '_v'>>
        | ((
            ops: UpdateOps<ESchemaType<TSchema>>,
          ) => AnyOperation<ESchemaType<TSchema>>[]);
      condition?: ConditionInput<ESchemaType<TSchema>>;
      lastWriteWins?: boolean;
    }): Effect.Effect<TransactItem, DynamodbError, DynamoDB> => {
      const { update: updates, condition } = params;
      return Effect.gen({ self: this }, function* () {
        const existing = yield* this.get({ ConsistentRead: true });
        return yield* decision(
          'Was a singleton available for the update operation?',
          {
            description:
              'Builds the deferred update only when a singleton is already stored.',
            attributes: { entity: this.#eschema.name },
          },
          existing.meta._u === '' ? 'missing' : 'stored',
        ).pipe(
          when(
            'missing',
            {
              name: 'No singleton was stored',
              description:
                'Fails because the default value cannot produce a native update operation.',
              completion: { kind: 'error', error: 'NoItemToUpdate' },
            },
            () => Effect.fail(DynamodbError.noItemToUpdate()),
          ),
          when(
            'stored',
            {
              name: 'Build the update operation',
              description:
                'Compiles the guarded singleton update and its broadcast value.',
            },
            () =>
              step(
                'Prepare the deferred singleton update',
                {
                  description:
                    'Compiles keys, update expressions, guards, and broadcast data for the transaction.',
                  visibility: 'detail',
                },
                () =>
                  Effect.sync(() => {
                    const expectedU = params.lastWriteWins
                      ? undefined
                      : existing.meta._u;
                    const mergedValue =
                      typeof updates === 'function'
                        ? existing.value
                        : ({
                            ...existing.value,
                            ...updates,
                          } as ESchemaType<TSchema>);
                    const pk = this.#derivePrimaryKey();
                    return {
                      entityName: this.#eschema.name,
                      operationKind: 'updateOp',
                      pk,
                      sk: pk,
                      table: this.#table,
                      apply: (u) => {
                        const prepared =
                          typeof updates === 'function'
                            ? this.#prepareUpdateExpr(
                                updates,
                                u,
                                condition,
                                expectedU,
                              )
                            : this.#prepareUpdate(
                                updates,
                                u,
                                condition,
                                expectedU,
                              );
                        return {
                          ...this.#table.opUpdateItem(
                            { pk: prepared.pk, sk: prepared.sk },
                            prepared.exprResult,
                          ),
                          broadcast: {
                            value: mergedValue,
                            meta: { ...existing.meta, _u: u, _d: false },
                          },
                        };
                      },
                    } satisfies TransactItem;
                  }),
              ),
          ),
          exhaustive,
        );
      });
    },
  );

  /**
   * The portable read-modify-write (see db ADR 0002): reads the current
   * entity (the schema default when nothing is stored), derives a partial
   * from it, and writes the merged record back as a `PutItem` guarded on the
   * `_u` that was read — or on "record does not exist yet" when the read saw
   * the default. Retries up to `retries` times (default 3) on conflict
   * before failing with `conditionCheckFailed`. A callback returning `null`
   * skips the write. `lastWriteWins: true` drops the guard.
   *
   * @param update - Partial entity, or a callback deriving one from the current value
   * @param config - Retry count and guard opt-out
   * @returns The updated entity with new metadata
   */
  getAndUpdate = flow(
    'Get and update singleton entity',
    {
      description:
        'Reads, derives, and conditionally writes a guarded singleton replacement.',
    },
    (
      update:
        | Partial<Omit<ESchemaType<TSchema>, '_v'>>
        | ((
            current: ESchemaType<TSchema>,
          ) => Partial<Omit<ESchemaType<TSchema>, '_v'>> | null),
      config?: { retries?: number; lastWriteWins?: boolean },
    ): Effect.Effect<
      SingleEntityType<ESchemaType<TSchema>>,
      DynamodbError,
      DynamoDB
    > => {
      const retries = config?.retries ?? 3;
      const attemptUpdate = flow(
        'Attempt singleton replacement',
        {
          description:
            'Reads current singleton state and attempts one guarded replacement.',
          attributes: (attempt: number) => ({
            entity: this.#eschema.name,
            attempt,
          }),
        },
        (
          attempt: number,
        ): Effect.Effect<
          SingleEntityType<ESchemaType<TSchema>>,
          DynamodbError,
          DynamoDB
        > =>
          Effect.gen({ self: this }, function* () {
            const existing = yield* this.get({ ConsistentRead: true });
            const partial = this.#resolveUpdateInput(update, existing.value);

            return yield* decision(
              'Should the derived change be written?',
              {
                description:
                  'Selects whether the derived singleton update skips persistence or writes merged state.',
                attributes: { entity: this.#eschema.name, attempt },
              },
              partial === null ? 'skip' : 'write',
            ).pipe(
              when(
                'skip',
                {
                  name: 'Keep the current value',
                  description:
                    'Returns current singleton state because the callback requested no write.',
                },
                () => Effect.succeed(existing),
              ),
              when(
                'write',
                {
                  name: 'Write the replacement',
                  description:
                    'Merges and conditionally writes the derived singleton state.',
                },
                () =>
                  Effect.gen({ self: this }, function* () {
                    const fullValue = {
                      ...existing.value,
                      ...partial!,
                      _v: this.#eschema.latestVersion,
                    } as ESchemaType<TSchema>;
                    const encoded = yield* step(
                      'Encode the optimistic replacement',
                      {
                        description:
                          'Validates and encodes the merged singleton value before its guarded write.',
                        visibility: 'detail',
                      },
                      () =>
                        this.#eschema
                          .encode(fullValue as any)
                          .pipe(
                            Effect.mapError((e) =>
                              DynamodbError.putItemFailed(e),
                            ),
                          ),
                    );
                    const _u = yield* nextUlid;
                    const meta: SingleMetaType = {
                      _e: this.#eschema.name,
                      _v: this.#eschema.latestVersion,
                      _u,
                    };
                    const pk = this.#derivePrimaryKey();
                    const item = {
                      ...encoded,
                      ...meta,
                      [this.#table.primary.pk]: pk,
                      [this.#table.primary.sk]: pk,
                    };
                    const exprResult = yield* step(
                      'Prepare the singleton write guard',
                      {
                        description:
                          'Builds the optimistic condition for the current singleton cursor.',
                        visibility: 'detail',
                      },
                      () =>
                        Effect.sync(() =>
                          config?.lastWriteWins
                            ? undefined
                            : buildExpr({
                                condition:
                                  existing.meta._u === ''
                                    ? exprCondition(($) =>
                                        $.attributeNotExists(
                                          this.#table.primary.pk as any,
                                        ),
                                      )
                                    : exprCondition(($) =>
                                        $.cond(
                                          '_u' as any,
                                          '=',
                                          existing.meta._u,
                                        ),
                                      ),
                              }),
                        ),
                    );
                    const conflicted = yield* this.#table
                      .putItem(item, exprResult)
                      .pipe(
                        Effect.as(false),
                        Effect.catchIf(
                          (e): e is DynamodbError =>
                            e.error._tag === 'PutItemFailed' &&
                            isConditionalCheckFailed(e),
                          () => Effect.succeed(true),
                        ),
                      );

                    return yield* decision(
                      'Did the guarded write succeed?',
                      {
                        description:
                          'Distinguishes a successful optimistic write from a retryable or exhausted conflict.',
                        attributes: { entity: this.#eschema.name, attempt },
                      },
                      !conflicted
                        ? 'written'
                        : attempt < retries
                          ? 'retry'
                          : 'exhausted',
                    ).pipe(
                      when(
                        'written',
                        {
                          name: 'The write succeeded',
                          description:
                            'Broadcasts and returns the successfully stored value.',
                        },
                        () =>
                          Effect.gen({ self: this }, function* () {
                            yield* this.#broadcast([
                              {
                                value: fullValue,
                                meta: { ...meta, _d: false },
                              },
                            ]);
                            return { value: fullValue, meta };
                          }),
                      ),
                      when(
                        'retry',
                        {
                          name: 'Read again and retry',
                          description:
                            'Re-reads singleton state and derives the update again after a concurrent write.',
                        },
                        () => attemptUpdate(attempt + 1),
                      ),
                      when(
                        'exhausted',
                        {
                          name: 'The retry limit was reached',
                          description:
                            'Fails after the configured number of optimistic retries is exhausted.',
                          completion: {
                            kind: 'error',
                            error: 'ConditionCheckFailed',
                          },
                        },
                        () => Effect.fail(DynamodbError.conditionCheckFailed()),
                      ),
                      exhaustive,
                    );
                  }),
              ),
              exhaustive,
            );
          }),
      );
      return attemptUpdate(0);
    },
  );

  /**
   * Op form of `getAndUpdate` for use in `transact`. Pre-fetches the current
   * entity, resolves the update against it, and defers a full-record
   * `PutItem` guarded on the `_u` that was read (unless `lastWriteWins`).
   * Fails with `noItemToUpdate` before the first persisted write (i.e.,
   * `_u === ""`); cannot retry — a conflict surfaces as the transaction's
   * condition failure.
   *
   * @param update - Partial entity, or a callback deriving one from the current value
   * @param config - Guard opt-out
   * @returns A transaction item for the write with broadcast data
   */
  getAndUpdateOp = flow(
    'Build portable singleton update operation',
    {
      description:
        'Reads singleton state and builds its deferred guarded replacement.',
    },
    (
      update:
        | Partial<Omit<ESchemaType<TSchema>, '_v'>>
        | ((
            current: ESchemaType<TSchema>,
          ) => Partial<Omit<ESchemaType<TSchema>, '_v'>>),
      config?: { lastWriteWins?: boolean },
    ): Effect.Effect<TransactItem, DynamodbError, DynamoDB> => {
      return Effect.gen({ self: this }, function* () {
        const existing = yield* this.get({ ConsistentRead: true });
        return yield* decision(
          'Was a singleton available for replacement?',
          {
            description:
              'Builds the deferred replacement only when a singleton is already stored.',
            attributes: { entity: this.#eschema.name },
          },
          existing.meta._u === '' ? 'missing' : 'stored',
        ).pipe(
          when(
            'missing',
            {
              name: 'No singleton was stored',
              description:
                'Fails because the default value cannot produce a guarded replacement.',
              completion: { kind: 'error', error: 'NoItemToUpdate' },
            },
            () => Effect.fail(DynamodbError.noItemToUpdate()),
          ),
          when(
            'stored',
            {
              name: 'Build the replacement operation',
              description:
                'Encodes the replacement and builds its guarded transactional put.',
            },
            () =>
              step(
                'Prepare the deferred singleton replacement',
                {
                  description:
                    'Derives, encodes, guards, and packages the singleton replacement.',
                  visibility: 'detail',
                },
                () =>
                  Effect.gen({ self: this }, function* () {
                    const fullValue = {
                      ...existing.value,
                      ...(typeof update === 'function'
                        ? update(existing.value)
                        : update),
                      _v: this.#eschema.latestVersion,
                    } as ESchemaType<TSchema>;
                    const encoded = yield* this.#eschema
                      .encode(fullValue as any)
                      .pipe(
                        Effect.mapError((e) => DynamodbError.putItemFailed(e)),
                      );
                    const exprResult = config?.lastWriteWins
                      ? undefined
                      : buildExpr({
                          condition: exprCondition(($) =>
                            $.cond('_u' as any, '=', existing.meta._u),
                          ),
                        });
                    const pk = this.#derivePrimaryKey();
                    return {
                      entityName: this.#eschema.name,
                      operationKind: 'updateOp',
                      pk,
                      sk: pk,
                      table: this.#table,
                      apply: (u) => {
                        const meta: SingleMetaType = {
                          _e: this.#eschema.name,
                          _v: this.#eschema.latestVersion,
                          _u: u,
                        };
                        const item = {
                          ...encoded,
                          ...meta,
                          [this.#table.primary.pk]: pk,
                          [this.#table.primary.sk]: pk,
                        };
                        return {
                          ...this.#table.opPutItem(item, exprResult),
                          broadcast: {
                            value: fullValue,
                            meta: { ...meta, _d: false },
                          },
                        };
                      },
                    } satisfies TransactItem;
                  }),
              ),
          ),
          exhaustive,
        );
      });
    },
  );

  /** Writes the default value back — single entities are never deleted. */
  reset = flow(
    'Reset singleton entity',
    { description: 'Writes the configured default as the singleton value.' },
    (): Effect.Effect<
      SingleEntityType<ESchemaType<TSchema>>,
      DynamodbError,
      DynamoDB
    > => this.put(this.#defaultValue),
  );

  #broadcast(entities: EntityType<ESchemaType<TSchema>>[]) {
    return Effect.gen(function* () {
      const service = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );
      service?.broadcast(entities);
    });
  }

  #buildUpdateCondition(
    userCondition?: ConditionInput<ESchemaType<TSchema>>,
    expectedU?: string,
  ): ConditionOperation {
    const ops: ConditionOperation[] = [
      exprCondition(($) =>
        $.cond('_v' as any, '=', this.#eschema.latestVersion),
      ),
    ];
    if (expectedU !== undefined) {
      ops.push(exprCondition(($) => $.cond('_u' as any, '=', expectedU)));
    }
    if (userCondition) ops.push(resolveCondition(userCondition));
    return exprCondition(($) => $.and(...ops));
  }

  #mapUpdateError(
    error: DynamodbError,
    condition?: ConditionInput<ESchemaType<TSchema>>,
  ): DynamodbError {
    if (
      error.error._tag !== 'UpdateItemFailed' ||
      !isConditionalCheckFailed(error)
    ) {
      return error;
    }
    return condition
      ? DynamodbError.conditionCheckFailed()
      : DynamodbError.noItemToUpdate();
  }

  #resolveUpdateInput(
    update: SingleUpdateInput<ESchemaType<TSchema>>,
    current: ESchemaType<TSchema>,
  ) {
    return typeof update === 'function' ? update(current) : update;
  }

  #prepareUpdate(
    updates: Partial<Omit<ESchemaType<TSchema>, '_v'>>,
    _u: string,
    condition?: ConditionInput<ESchemaType<TSchema>>,
    expectedU?: string,
  ): { pk: string; sk: string; exprResult: UpdateExprResult } {
    const pk = this.#derivePrimaryKey();
    const sk = this.#derivePrimaryKey();

    const builtCondition = this.#buildUpdateCondition(condition, expectedU);

    const update = exprUpdate<any>(($) => [
      ...Object.entries(updates).map(([key, v]) => $.set(key, v)),
      $.set('_u', _u),
    ]);

    const exprResult = buildExpr({
      update,
      condition: builtCondition,
    });

    return { pk, sk, exprResult };
  }

  #prepareUpdateExpr(
    builder: (ops: UpdateOps<any>) => AnyOperation<any>[],
    _u: string,
    condition?: ConditionInput<ESchemaType<TSchema>>,
    expectedU?: string,
  ): { pk: string; sk: string; exprResult: UpdateExprResult } {
    const pk = this.#derivePrimaryKey();
    const sk = this.#derivePrimaryKey();

    const userOps = exprUpdate<any>(builder);

    const builtCondition = this.#buildUpdateCondition(condition, expectedU);

    const update = exprUpdate<any>(($) => [...userOps, $.set('_u', _u)]);

    const exprResult = buildExpr({
      update,
      condition: builtCondition,
    });

    return { pk, sk, exprResult };
  }
}
