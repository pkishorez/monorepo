import type { AnyEntityESchema, ESchemaType } from '../../../eschema/index.js';
import { Effect, Option, Schema, Stream, Struct } from 'effect';
import {
  decision,
  exhaustive,
  flow,
  forEach as storyForEach,
  step,
  when,
} from 'laymos/story';
import type { DynamoTable } from './dynamo-table.js';
import type { DynamoDB } from './dynamo-client.js';
import { Broadcaster, nextUlid } from '../../../core/index.js';
import { DynamodbError } from '../errors.js';
import type {
  IndexDefinition,
  IndexPkValue,
  TransactItem,
  SkParam,
  CustomSkParam,
  StreamSkParam,
  SimpleQueryOptions,
  QueryStreamOptions,
} from '../types/index.js';
import { extractKeyOp, getKeyOpScanDirection } from '../types/index.js';
import {
  deriveIndexKeyValue,
  isConditionalCheckFailed,
  extractConditionFailureItem,
} from '../internal/index.js';
import {
  buildExpr,
  type ConditionExprResult,
  type UpdateExprResult,
} from '../expr/build-expr.js';
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
import type { SortKeyparameter } from '../expr/key-condition.js';

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
 * Meta fields that can be used in index derivations.
 */
type DerivableMetaFields = '_u';

/**
 * Extracts root attribute keys from a (possibly nested) array of update operations.
 */
function extractKeysFromOps(
  ops: any[],
  out: Set<string> = new Set(),
): Set<string> {
  for (const op of ops) {
    if (Array.isArray(op)) {
      extractKeysFromOps(op, out);
    } else if (op && typeof op === 'object' && 'key' in op) {
      const key = String(op.key);
      const dot = key.indexOf('.');
      out.add(dot === -1 ? key : key.slice(0, dot));
    }
  }
  return out;
}

/**
 * Represents an entity item with its value and metadata.
 *
 * @typeParam T - The entity value type
 */
export interface EntityType<T> {
  /** The entity data */
  value: T;
  /** Metadata about the entity item */
  meta: MetaType;
}

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

/**
 * Update input for `getAndUpdateOp` — no `null` skip, since an op must always
 * produce a write descriptor.
 */
type UpdateOpInput<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>>);

/** Config for `getAndUpdate`. `retries` counts retry attempts after the first try. */
interface GetAndUpdateConfig {
  retries?: number;
  lastWriteWins?: boolean;
}

/**
 * Stored derivation info for a secondary index.
 */
export interface StoredIndexDerivation {
  /** The actual GSI name on the table (e.g., "GSI1") */
  gsiName: string;
  /** The semantic name for this entity's use of the index (e.g., "byEmail") */
  entityIndexName: string;
  /** Field names used to derive the partition key */
  pkDeps: string[];
  /** Field names used to derive the sort key */
  skDeps: string[];
  /** True when skDeps = ["_u"] (timeline-style SK) */
  isTimelineSk: boolean;
}

/**
 * Internal derivation info for the primary index.
 */
interface StoredPrimaryDerivation {
  /** Field names used to derive the partition key */
  pkDeps: string[];
  /** Field names used to derive the sort key */
  skDeps: string[];
}

/**
 * Helper type to extract the key type from an array of keys.
 * For empty arrays, returns never so Pick<T, never> = {}
 */
type ExtractKeys<T, Keys extends readonly (keyof T)[]> = Keys[number];

/**
 * Type-level check: is this SK tuple exactly ["_u"]?
 */
type IsTimelineSk<T extends readonly unknown[]> = T extends readonly ['_u']
  ? true
  : false;

/**
 * Resolves the SK param type for a secondary index based on isTimelineSk.
 * - isTimelineSk = true → SkParam (string | null cursor)
 * - isTimelineSk = false → CustomSkParam (object | null)
 */
type ResolveSkParam<
  TEntity,
  TDeriv extends StoredIndexDerivation,
> = TDeriv['isTimelineSk'] extends true
  ? SkParam
  : CustomSkParam<TEntity, TDeriv['skDeps'] & readonly (keyof TEntity)[]>;

/**
 * Resolves the stream SK param type for a secondary index based on isTimelineSk.
 */
type ResolveStreamSkParam<
  TEntity,
  TDeriv extends StoredIndexDerivation,
> = TDeriv['isTimelineSk'] extends true
  ? StreamSkParam
  : CustomStreamSkParam<TEntity, TDeriv['skDeps'] & readonly (keyof TEntity)[]>;

/**
 * Stream SK param for custom-SK indexes (exclusive operators only).
 */
type CustomStreamSkParam<T, SkKeys extends readonly (keyof T)[]> =
  | { '>': Pick<T, SkKeys[number]> | null }
  | { '<': Pick<T, SkKeys[number]> | null };

/**
 * A DynamoDB entity with type-safe CRUD operations and automatic index derivation.
 * Entities are built on top of a DynamoTable and use an ESchema for validation.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TSecondaryDerivationMap - Map of secondary index derivations
 * @typeParam TSchema - The ESchema type for this entity
 * @typeParam TPrimaryPkKeys - Keys used for primary partition key derivation
 */
export class DynamoEntity<
  TTable extends DynamoTable<any, any>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
> {
  /**
   * Creates a new entity builder for the given table.
   *
   * @typeParam TTable - The DynamoTable instance type
   * @param table - The DynamoTable instance
   * @returns A builder to configure the entity schema
   */
  static make<TTable extends DynamoTable<any, any>>(
    table: TTable,
    onBuild?: (entity: DynamoEntity<any, any, any, any>) => void,
  ) {
    return {
      /**
       * Configures the entity to use the given ESchema.
       *
       * @typeParam TS - The ESchema type
       * @param eschema - The ESchema instance
       * @returns A builder to configure the primary index derivation
       */
      eschema<TS extends AnyEntityESchema>(eschema: TS) {
        return {
          /**
           * Defines the primary index derivation fields.
           * SK is automatically set to the ESchema's idField.
           *
           * @param primaryDerivation - Optional pk field array. If not provided, uses entity name only.
           * @returns A builder to add secondary index mappings
           */
          primary<
            const TPkKeys extends readonly (keyof ESchemaType<TS>)[] = [],
          >(primaryDerivation?: { pk: TPkKeys }) {
            const pkKeys = primaryDerivation?.pk ?? ([] as unknown as TPkKeys);
            if ((pkKeys as readonly PropertyKey[]).includes('_u')) {
              throw new Error(
                'Primary partition key derivation cannot include "_u"',
              );
            }
            // SK is always the idField from the ESchema
            const skKeys = [eschema.idField] as const;
            return new EntityIndexDerivations<
              TTable,
              TS,
              ExtractKeys<ESchemaType<TS>, TPkKeys>,
              {}
            >(table, eschema, { pk: pkKeys, sk: skKeys } as any, {}, onBuild);
          },
        };
      },
    };
  }

  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: StoredPrimaryDerivation;
  #secondaryDerivations: TSecondaryDerivationMap;
  #derivationDeps: Set<string>;
  #indexAttrNames: Set<string>;

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
    primaryDerivation: StoredPrimaryDerivation,
    secondaryDerivations: TSecondaryDerivationMap,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = secondaryDerivations;

    const deps = new Set<string>();
    for (const [, deriv] of Object.entries(secondaryDerivations)) {
      const d = deriv as StoredIndexDerivation;
      for (const dep of d.pkDeps) deps.add(dep);
      for (const dep of d.skDeps) {
        if (dep !== '_u') deps.add(dep);
      }
    }
    this.#derivationDeps = deps;

    const indexAttrNames = new Set<string>([
      table.primary.pk,
      table.primary.sk,
    ]);
    for (const index of Object.values(
      table.secondaryIndexMap,
    ) as IndexDefinition[]) {
      indexAttrNames.add(index.pk);
      indexAttrNames.add(index.sk);
    }
    this.#indexAttrNames = indexAttrNames;
  }

  /**
   * Gets the entity name from the schema.
   */
  get name(): TSchema['name'] {
    return this.#eschema.name;
  }

  /**
   * Retrieves an entity by its primary key fields.
   *
   * @param keyValue - Object containing the primary key field values
   * @param options - Optional read options
   * @returns The entity if found, or null
   */
  get = flow(
    'Get entity',
    { description: 'Reads and decodes one entity by its primary key.' },
    (
      keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
        Pick<ESchemaType<TSchema>, TSchema['idField']>,
      options?: { ConsistentRead?: boolean },
    ): Effect.Effect<
      EntityType<ESchemaType<TSchema>> | null,
      DynamodbError,
      DynamoDB
    > => {
      return Effect.gen({ self: this }, function* () {
        const pk = deriveIndexKeyValue(
          this.#eschema.name,
          this.#primaryDerivation.pkDeps,
          keyValue as Record<string, unknown>,
          true,
        );
        const sk = deriveIndexKeyValue(
          this.#eschema.name,
          this.#primaryDerivation.skDeps,
          keyValue as Record<string, unknown>,
          false,
        );

        const { Item } = yield* this.#table.getItem({ pk, sk }, options);

        return yield* decision(
          'Was the entity found?',
          {
            description:
              'Distinguishes a stored entity from a missing primary-key lookup.',
            attributes: { entity: this.#eschema.name },
          },
          Boolean(Item),
        ).pipe(
          when(
            true,
            {
              name: 'The entity was found',
              description: 'Decodes the stored item and its adapter metadata.',
            },
            () =>
              step(
                'Decode its stored value',
                {
                  description:
                    'Decodes the stored schema value and separates its entity metadata.',
                  visibility: 'detail',
                },
                () =>
                  this.#eschema.decode(Item!).pipe(
                    Effect.mapError((e) => DynamodbError.getItemFailed(e)),
                    Effect.map((value) => ({
                      value: value as ESchemaType<TSchema>,
                      meta: Schema.decodeUnknownSync(metaSchema)(Item),
                    })),
                  ),
              ),
          ),
          when(
            false,
            {
              name: 'No entity was found',
              description:
                'Returns null because DynamoDB has no matching item.',
            },
            () => Effect.succeed(null),
          ),
          exhaustive,
        );
      });
    },
  );

  /**
   * Inserts a new entity. Fails if an item with the same key already exists.
   *
   * @param value - The entity value to insert
   * @param options - Insert options including condition
   * @returns The inserted entity with metadata
   */
  insert = flow(
    'Insert entity',
    { description: 'Validates and stores one new keyed entity.' },
    (
      value: InsertInput<ESchemaType<TSchema>>,
      options?: {
        condition?: ConditionInput<ESchemaType<TSchema>>;
      },
    ): Effect.Effect<
      EntityType<ESchemaType<TSchema>>,
      DynamodbError,
      DynamoDB
    > => {
      return Effect.gen({ self: this }, function* () {
        const fullValueWithId = {
          ...value,
          _v: this.#eschema.latestVersion,
        } as unknown as ESchemaType<TSchema>;

        const { exprResult, fullValue, restamp } = yield* step(
          'Validate and prepare the new entity',
          {
            description:
              'Encodes the entity, derives every index key, and builds the duplicate guard.',
            visibility: 'detail',
          },
          () => this.#prepareInsert(fullValueWithId, options?.condition),
        );
        const { item, meta } = restamp(yield* nextUlid);

        yield* this.#table
          .putItem(item, { ReturnValues: 'ALL_OLD', ...exprResult })
          .pipe(
            Effect.catchIf(
              (e): e is DynamodbError =>
                e.error._tag === 'PutItemFailed' && isConditionalCheckFailed(e),
              () => Effect.fail(DynamodbError.itemAlreadyExists()),
            ),
          );

        const entity = { value: fullValue, meta };
        yield* this.#broadcast([entity]);
        return entity;
      });
    },
  );

  batchInsert = flow(
    'Batch insert entities',
    {
      description:
        'Validates and stores keyed entities in DynamoDB-sized batches.',
    },
    (
      values: InsertInput<ESchemaType<TSchema>>[],
    ): Effect.Effect<
      {
        written: EntityType<ESchemaType<TSchema>>[];
        unprocessedIndexes: number[];
      },
      DynamodbError,
      DynamoDB
    > => {
      return Effect.gen({ self: this }, function* () {
        const prepared = yield* storyForEach(values, (value) =>
          step(
            'Prepare each entity in the batch',
            {
              description:
                'Encodes one input, derives its indexes, and stamps its write metadata.',
              visibility: 'detail',
            },
            () =>
              Effect.gen({ self: this }, function* () {
                const fullValue = {
                  ...value,
                  _v: this.#eschema.latestVersion,
                } as unknown as ESchemaType<TSchema>;
                const item = yield* this.#prepareInsert(fullValue);
                const stamped = item.restamp(yield* nextUlid);
                return {
                  item: stamped.item,
                  entity: { value: item.fullValue, meta: stamped.meta },
                };
              }),
          ),
        );
        const items = prepared.map(({ item }) => item);
        const entities = prepared.map(({ entity }) => entity);
        const { unprocessedIndexes } = yield* this.#table.batchWrite(items);
        const failed = new Set(unprocessedIndexes);
        const written = entities.filter((_, i) => !failed.has(i));
        yield* step(
          'Broadcast the written batch',
          {
            description:
              'Publishes the successfully written entities when the batch produced any.',
            visibility: 'detail',
          },
          () =>
            Effect.suspend(() =>
              written.length > 0 ? this.#broadcast(written) : Effect.void,
            ),
        );
        return { written, unprocessedIndexes };
      });
    },
  );

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
  update = flow(
    'Update entity',
    {
      description:
        'Applies a partial or native expression update to one keyed entity.',
    },
    (
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
      DynamodbError,
      DynamoDB
    > => {
      const { update: updates, condition, autoMigrate = true } = params;
      return Effect.gen({ self: this }, function* () {
        const { pk, sk, restamp } = yield* decision(
          'How should the update be expressed?',
          {
            description:
              'Selects whether to compile a partial value or a native update-expression callback.',
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
              step(
                'Compile update expressions',
                {
                  description:
                    'Compiles the caller callback into DynamoDB update operations.',
                },
                () =>
                  this.#prepareUpdateExpr(
                    keyValue as Record<string, unknown>,
                    updates as any,
                    condition,
                  ),
              ),
          ),
          when(
            'partial',
            {
              name: 'Use changed fields',
              description:
                'Encodes the supplied fields into DynamoDB set operations.',
            },
            () =>
              step(
                'Encode changed fields',
                {
                  description:
                    'Encodes the supplied entity fields into DynamoDB update operations.',
                },
                () =>
                  this.#prepareUpdate(
                    keyValue as Record<string, unknown>,
                    updates as any,
                    condition,
                  ),
              ),
          ),
          exhaustive,
        );
        const { exprResult } = restamp(yield* nextUlid);

        const attemptUpdate = flow(
          'Apply the guarded update',
          {
            description:
              'Writes the compiled entity update with its schema and caller guards.',
            visibility: 'detail',
          },
          () =>
            this.#table.updateItem(
              { pk, sk },
              {
                ReturnValues: 'ALL_NEW',
                ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
                ...exprResult,
              },
            ),
        );
        const resultOrRetry = yield* attemptUpdate().pipe(
          Effect.catchIf(
            (e): e is DynamodbError =>
              e.error._tag === 'UpdateItemFailed' &&
              isConditionalCheckFailed(e),
            (e) => this.#handleConditionFailure(e, autoMigrate, condition),
          ),
        );
        const completedResult = resultOrRetry as {
          Attributes: Record<string, unknown> | null;
        };
        const result = yield* decision(
          'Should the guarded update be retried?',
          {
            description:
              'Retries once after automatic migration or continues with the completed update.',
            attributes: { entity: this.#eschema.name },
          },
          '_retry' in resultOrRetry,
        ).pipe(
          when(
            true,
            {
              name: 'Retry after migration',
              description:
                'Repeats the guarded update after migrating stale stored data.',
            },
            () =>
              attemptUpdate().pipe(
                Effect.mapError((error) =>
                  this.#mapRetryUpdateError(error, condition !== undefined),
                ),
              ),
          ),
          when(
            false,
            {
              name: 'Continue with the result',
              description:
                'Uses the result from the first guarded update attempt.',
            },
            () => Effect.succeed(completedResult),
          ),
          exhaustive,
        );
        return yield* decision(
          'Did DynamoDB return the updated entity?',
          {
            description:
              'Returns the decoded update or fails when no stored entity was updated.',
            attributes: { entity: this.#eschema.name },
          },
          result.Attributes ? 'updated' : 'missing',
        ).pipe(
          when(
            'updated',
            {
              name: 'Return the updated entity',
              description:
                'Decodes, broadcasts, and returns the freshly updated entity.',
            },
            () =>
              Effect.gen({ self: this }, function* () {
                const { decodedValue, updatedMeta } = yield* step(
                  'Decode the updated value',
                  {
                    description:
                      'Decodes the returned schema value and its freshly written metadata.',
                    visibility: 'detail',
                  },
                  () =>
                    this.#eschema.decode(result.Attributes!).pipe(
                      Effect.mapError((e) => DynamodbError.updateItemFailed(e)),
                      Effect.map((decodedValue) => ({
                        decodedValue,
                        updatedMeta: Schema.decodeUnknownSync(metaSchema)(
                          result.Attributes,
                        ),
                      })),
                    ),
                );
                const entity = {
                  value: decodedValue as ESchemaType<TSchema>,
                  meta: updatedMeta,
                };
                yield* this.#broadcast([entity]);
                return entity;
              }),
          ),
          when(
            'missing',
            {
              name: 'No entity was updated',
              description: 'Fails because no stored entity matched the update.',
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
   * Deletes an entity. Defaults to a soft delete by setting the `_d` flag to
   * true. The row stays in the table so downstream consumers can observe the
   * tombstone and reconcile their state.
   *
   * Pass `forceDelete: "I know what I am doing"` to perform a hard delete
   * that physically removes the item from the table.
   *
   * ⚠️ **Hard delete disclaimer — read before using `forceDelete`.**
   * Hard delete is **not safe for sync engines** or any consumer that
   * replays/streams changes from this table:
   * - Sync engines that rely on tombstones (`_d: true`) to propagate
   *   deletions to clients will silently miss the deletion. Clients that
   *   already cached the row will keep stale state forever, since they
   *   never receive a delete event.
   * - Stream-based downstream readers (DynamoDB Streams consumers, change
   *   data capture pipelines) only see a REMOVE event with no payload, so
   *   any logic that needs the prior values to fan out the delete will
   *   fail or behave incorrectly.
   * - Audit/history flows lose the ability to answer "what was this row
   *   right before it was deleted?".
   * - Hard delete bypasses the standard update path: secondary index
   *   tombstones are not written, so consumers that query by GSI to
   *   discover deletions will not see this entity disappear cleanly.
   *
   * Only use `forceDelete` for one-off administrative cleanup, fixtures,
   * tests, or rows that you are certain no sync/stream consumer depends on.
   * When in doubt, use the default soft delete.
   *
   * @param keyValue - Object containing the primary key field values
   * @param options.forceDelete - Acknowledgement string that opts into hard delete
   * @returns The deleted entity (with `_d: true` for both soft and hard delete)
   */
  delete = flow(
    'Delete entity',
    {
      description:
        'Soft-deletes an entity or physically removes it after explicit acknowledgement.',
    },
    (
      keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
        Pick<ESchemaType<TSchema>, TSchema['idField']>,
      options?: {
        forceDelete?: 'I know what I am doing';
      },
    ): Effect.Effect<
      EntityType<ESchemaType<TSchema>>,
      DynamodbError,
      DynamoDB
    > => {
      return Effect.gen({ self: this }, function* () {
        yield* step(
          'Start deleting the entity',
          {
            description:
              'Starts the delete flow before loading the current entity.',
          },
          () => Effect.void,
        );
        const existing = yield* this.get(keyValue);

        return yield* decision(
          'How should it be deleted?',
          {
            description:
              'Routes a missing item to an error and an existing item to soft or physical deletion.',
            attributes: { entity: this.#eschema.name },
          },
          !existing
            ? 'missing'
            : options?.forceDelete === 'I know what I am doing'
              ? 'physical'
              : 'tombstone',
        ).pipe(
          when(
            'missing',
            {
              name: 'The entity is missing',
              description: 'Fails because there is no entity to delete.',
              completion: { kind: 'error', error: 'NoItemToDelete' },
            },
            () => Effect.fail(DynamodbError.noItemToDelete()),
          ),
          when(
            'physical',
            {
              name: 'Remove it permanently',
              description:
                'Physically removes the row after the explicit safety acknowledgement.',
            },
            () =>
              Effect.gen({ self: this }, function* () {
                const pk = deriveIndexKeyValue(
                  this.#eschema.name,
                  this.#primaryDerivation.pkDeps,
                  keyValue as Record<string, unknown>,
                  true,
                );
                const sk = deriveIndexKeyValue(
                  this.#eschema.name,
                  this.#primaryDerivation.skDeps,
                  keyValue as Record<string, unknown>,
                  false,
                );
                yield* this.#table.deleteItem({ pk, sk });
                const deleted = {
                  value: existing!.value,
                  meta: { ...existing!.meta, _d: true as const },
                };
                yield* this.#broadcast([deleted]);
                return deleted;
              }),
          ),
          when(
            'tombstone',
            {
              name: 'Keep a tombstone',
              description:
                'Keeps the row and marks it deleted so downstream readers can reconcile it.',
            },
            () =>
              Effect.gen({ self: this }, function* () {
                yield* step(
                  'Write the deletion tombstone',
                  {
                    description:
                      'Hands the soft delete to the guarded entity update path.',
                  },
                  () => Effect.void,
                );
                return yield* this.update(keyValue, {
                  update: { _d: true } as any,
                });
              }),
          ),
          exhaustive,
        );
      });
    },
  );

  /**
   * Restores a soft-deleted entity with a fresh `_u` so sync consumers see it
   * become live again.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The restored entity
   */
  restore = flow(
    'Restore entity',
    { description: 'Restores one soft-deleted entity to live state.' },
    (
      keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
        Pick<ESchemaType<TSchema>, TSchema['idField']>,
    ): Effect.Effect<
      EntityType<ESchemaType<TSchema>>,
      DynamodbError,
      DynamoDB
    > => {
      return Effect.gen({ self: this }, function* () {
        const existing = yield* this.get(keyValue);

        return yield* decision(
          'Does the entity need restoration?',
          {
            description:
              'Distinguishes a missing entity, an already-live entity, and a tombstone that needs restoring.',
            attributes: { entity: this.#eschema.name },
          },
          !existing ? 'missing' : existing.meta._d ? 'tombstone' : 'live',
        ).pipe(
          when(
            'missing',
            {
              name: 'The entity is missing',
              description: 'Fails because there is no entity to restore.',
              completion: { kind: 'error', error: 'NoItemToRestore' },
            },
            () => Effect.fail(DynamodbError.noItemToRestore()),
          ),
          when(
            'live',
            {
              name: 'It is already live',
              description:
                'Returns the existing entity because it is already live.',
            },
            () => Effect.succeed(existing!),
          ),
          when(
            'tombstone',
            {
              name: 'Restore the tombstone',
              description:
                'Clears the deletion marker and stamps a new update cursor.',
            },
            () =>
              this.update(keyValue, {
                update: { _d: false } as any,
              }),
          ),
          exhaustive,
        );
      });
    },
  );

  /**
   * Creates an insert operation for use in a transaction.
   * Includes broadcast data for emitting changes after successful transaction.
   *
   * @param value - The entity value to insert
   * @param options - Insert options including condition
   * @returns A transaction item for insert with broadcast data
   */
  insertOp = flow(
    'Build entity insert operation',
    {
      description:
        'Builds a deferred entity insert for an atomic table transaction.',
    },
    (
      value: InsertInput<ESchemaType<TSchema>>,
      options?: {
        condition?: ConditionInput<ESchemaType<TSchema>>;
      },
    ): Effect.Effect<TransactItem, DynamodbError, DynamoDB> => {
      return Effect.gen({ self: this }, function* () {
        const fullValueWithId = {
          ...value,
          _v: this.#eschema.latestVersion,
        } as unknown as ESchemaType<TSchema>;

        const { exprResult, fullValue, restamp } = yield* step(
          'Prepare deferred DynamoDB entity insert',
          {
            description:
              'Encodes the entity, derives its keys, and compiles the deferred duplicate guard.',
            visibility: 'detail',
          },
          () => this.#prepareInsert(fullValueWithId, options?.condition),
        );
        const { pk, sk } = this.#derivePrimaryIndex(fullValueWithId);

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
    },
  );

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
  updateOp = flow(
    'Build entity update operation',
    {
      description:
        'Reads one entity and builds its deferred transactional update.',
    },
    (
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
    ): Effect.Effect<TransactItem, DynamodbError, DynamoDB> => {
      const { update: updates, condition } = params;
      return Effect.gen({ self: this }, function* () {
        const existing = yield* this.get(keyValue, { ConsistentRead: true });
        return yield* decision(
          'Was an entity available for the update operation?',
          {
            description:
              'Builds the deferred update only when the entity already exists.',
            attributes: { entity: this.#eschema.name },
          },
          existing ? 'found' : 'missing',
        ).pipe(
          when(
            'missing',
            {
              name: 'No entity was found',
              description:
                'Fails because no stored entity can produce an update operation.',
              completion: { kind: 'error', error: 'NoItemToUpdate' },
            },
            () => Effect.fail(DynamodbError.noItemToUpdate()),
          ),
          when(
            'found',
            {
              name: 'Build the update operation',
              description:
                'Compiles the guarded update and its deferred broadcast value.',
            },
            () =>
              step(
                'Prepare the deferred update',
                {
                  description:
                    'Compiles keys, update expressions, guards, and broadcast data for the transaction.',
                  visibility: 'detail',
                },
                () =>
                  Effect.gen({ self: this }, function* () {
                    const current = existing!;
                    const expectedU = params.lastWriteWins
                      ? undefined
                      : current.meta._u;
                    const { pk, sk, restamp } =
                      typeof updates === 'function'
                        ? yield* this.#prepareUpdateExpr(
                            keyValue as Record<string, unknown>,
                            updates,
                            condition,
                            expectedU,
                            current.meta._d,
                          )
                        : yield* this.#prepareUpdate(
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
          ),
          exhaustive,
        );
      });
    },
  );

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
  getAndUpdate = flow(
    'Get and update entity',
    {
      description:
        'Reads, derives, and conditionally writes a guarded entity replacement.',
    },
    (
      keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
        Pick<ESchemaType<TSchema>, TSchema['idField']>,
      update: UpdateInput<ESchemaType<TSchema>>,
      config?: GetAndUpdateConfig,
    ): Effect.Effect<
      EntityType<ESchemaType<TSchema>>,
      DynamodbError,
      DynamoDB
    > => {
      const retries = config?.retries ?? 3;
      const attemptUpdate = flow(
        'Attempt entity replacement',
        {
          description:
            'Reads current entity state and attempts one guarded replacement.',
          attributes: (attempt: number) => ({
            entity: this.#eschema.name,
            attempt,
          }),
        },
        (
          attempt: number,
        ): Effect.Effect<
          EntityType<ESchemaType<TSchema>>,
          DynamodbError,
          DynamoDB
        > =>
          Effect.gen({ self: this }, function* () {
            const existing = yield* this.get(keyValue, {
              ConsistentRead: true,
            });
            return yield* decision(
              'Was an entity available to update?',
              {
                description:
                  'Routes a missing entity to failure before deriving an update.',
                attributes: { entity: this.#eschema.name, attempt },
              },
              existing ? 'found' : 'missing',
            ).pipe(
              when(
                'missing',
                {
                  name: 'No entity was found',
                  description: 'Fails because no stored entity can be updated.',
                  completion: {
                    kind: 'error',
                    error: 'NoItemToUpdate',
                  },
                },
                () => Effect.fail(DynamodbError.noItemToUpdate()),
              ),
              when(
                'found',
                {
                  name: 'Derive the replacement',
                  description:
                    'Derives the requested change from current entity state.',
                },
                () =>
                  Effect.gen({ self: this }, function* () {
                    const current = existing!;
                    const partial = this.#resolveUpdateInput(
                      update,
                      current.value,
                    );
                    return yield* decision(
                      'Should the derived change be written?',
                      {
                        description:
                          'Selects whether the derived update skips persistence or writes a merged entity.',
                        attributes: {
                          entity: this.#eschema.name,
                          attempt,
                        },
                      },
                      partial === null ? 'skip' : 'write',
                    ).pipe(
                      when(
                        'skip',
                        {
                          name: 'Keep the current entity',
                          description:
                            'Returns the current entity because the callback requested no write.',
                        },
                        () => Effect.succeed(current),
                      ),
                      when(
                        'write',
                        {
                          name: 'Write the replacement',
                          description:
                            'Merges and conditionally writes the derived entity state.',
                        },
                        () =>
                          Effect.gen({ self: this }, function* () {
                            const { fullValue, item, _u } = yield* step(
                              'Prepare the optimistic replacement',
                              {
                                description:
                                  'Merges the derived update, preserves entity identity, encodes canonical indexes, and stamps the next cursor.',
                                visibility: 'detail',
                              },
                              () =>
                                Effect.gen({ self: this }, function* () {
                                  const fullValue = {
                                    ...current.value,
                                    ...partial!,
                                  } as ESchemaType<TSchema>;
                                  const idField = this.#eschema.idField;
                                  if (
                                    !Object.is(
                                      fullValue[idField],
                                      current.value[idField],
                                    )
                                  ) {
                                    return yield* Effect.fail(
                                      DynamodbError.idUpdateNotSupported(
                                        idField,
                                      ),
                                    );
                                  }
                                  const _u = yield* nextUlid;
                                  const canonical =
                                    yield* this.#canonicalizeDecodedValue(
                                      fullValue,
                                      { _d: current.meta._d },
                                      _u,
                                    );
                                  const originalKey = this.#derivePrimaryIndex({
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
                                }),
                            );
                            const exprResult = yield* step(
                              'Prepare the entity write guard',
                              {
                                description:
                                  'Builds the optimistic condition for the current entity cursor.',
                                visibility: 'detail',
                              },
                              () =>
                                Effect.sync(() =>
                                  config?.lastWriteWins
                                    ? undefined
                                    : buildExpr({
                                        condition: exprCondition(($) =>
                                          $.cond(
                                            '_u' as any,
                                            '=',
                                            current.meta._u,
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
                                attributes: {
                                  entity: this.#eschema.name,
                                  attempt,
                                },
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
                                    'Broadcasts and returns the successfully stored entity.',
                                },
                                () =>
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
                              when(
                                'retry',
                                {
                                  name: 'Read again and retry',
                                  description:
                                    'Re-reads entity state and derives the update again after a concurrent write.',
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
                                () =>
                                  Effect.fail(
                                    DynamodbError.conditionCheckFailed(),
                                  ),
                              ),
                              exhaustive,
                            );
                          }),
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
   * Cannot retry — a conflict surfaces as the transaction's condition
   * failure.
   *
   * @param keyValue - Object containing the primary key field values
   * @param update - Partial entity, or a callback deriving one from the current value
   * @param config - Guard opt-out
   * @returns A transaction item for the write with broadcast data
   */
  getAndUpdateOp = flow(
    'Build portable entity update operation',
    {
      description:
        'Reads one entity and builds its deferred guarded replacement.',
    },
    (
      keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
        Pick<ESchemaType<TSchema>, TSchema['idField']>,
      update: UpdateOpInput<ESchemaType<TSchema>>,
      config?: { lastWriteWins?: boolean },
    ): Effect.Effect<TransactItem, DynamodbError, DynamoDB> => {
      return Effect.gen({ self: this }, function* () {
        const existing = yield* this.get(keyValue, { ConsistentRead: true });
        return yield* decision(
          'Was an entity available for replacement?',
          {
            description:
              'Builds the deferred replacement only when the entity already exists.',
            attributes: { entity: this.#eschema.name },
          },
          existing ? 'found' : 'missing',
        ).pipe(
          when(
            'missing',
            {
              name: 'No entity was found',
              description:
                'Fails because no stored entity can produce a guarded replacement.',
              completion: { kind: 'error', error: 'NoItemToUpdate' },
            },
            () => Effect.fail(DynamodbError.noItemToUpdate()),
          ),
          when(
            'found',
            {
              name: 'Build the replacement operation',
              description:
                'Encodes the replacement and builds its guarded transactional put.',
            },
            () =>
              step(
                'Prepare deferred DynamoDB entity replacement',
                {
                  description:
                    'Derives, validates, encodes, guards, and packages the entity replacement.',
                  visibility: 'detail',
                },
                () =>
                  Effect.gen({ self: this }, function* () {
                    const current = existing!;
                    const fullValue = {
                      ...current.value,
                      ...(typeof update === 'function'
                        ? update(current.value)
                        : update),
                    } as ESchemaType<TSchema>;
                    const idField = this.#eschema.idField;
                    if (
                      !Object.is(fullValue[idField], current.value[idField])
                    ) {
                      return yield* Effect.fail(
                        DynamodbError.idUpdateNotSupported(idField),
                      );
                    }
                    const encoded = yield* this.#eschema
                      .encode(fullValue as any)
                      .pipe(
                        Effect.mapError((e) => DynamodbError.putItemFailed(e)),
                      );
                    const exprResult = config?.lastWriteWins
                      ? undefined
                      : buildExpr({
                          condition: exprCondition(($) =>
                            $.cond('_u' as any, '=', current.meta._u),
                          ),
                        });
                    const { pk, sk } = this.#derivePrimaryIndex({
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
                          ...this.#deriveSecondaryIndexes(valueWithMeta),
                        };
                        return {
                          ...this.#table.opPutItem(item, exprResult),
                          broadcast: { value: fullValue, meta },
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

  deleteOp = flow(
    'Build entity delete operation',
    { description: 'Builds a deferred entity tombstone write.' },
    (
      keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
        Pick<ESchemaType<TSchema>, TSchema['idField']>,
      options?: { lastWriteWins?: boolean },
    ): Effect.Effect<TransactItem, DynamodbError, DynamoDB> =>
      this.#buildTombstoneOp(keyValue, true, options),
  );

  restoreOp = flow(
    'Build entity restore operation',
    { description: 'Builds a deferred entity restoration write.' },
    (
      keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
        Pick<ESchemaType<TSchema>, TSchema['idField']>,
      options?: { lastWriteWins?: boolean },
    ): Effect.Effect<TransactItem, DynamodbError, DynamoDB> =>
      this.#buildTombstoneOp(keyValue, false, options),
  );

  #buildTombstoneOp(
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    deleted: boolean,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<TransactItem, DynamodbError, DynamoDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(keyValue, { ConsistentRead: true });
      if (!existing) {
        return yield* Effect.fail(
          deleted
            ? DynamodbError.noItemToDelete()
            : DynamodbError.noItemToRestore(),
        );
      }

      const { pk, sk, restamp } = yield* this.#prepareUpdate(
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
  query = flow(
    'Query entities',
    {
      description:
        'Queries decoded entities through their primary or configured secondary index.',
    },
    <K extends 'primary' | (keyof TSecondaryDerivationMap & string)>(
      key: K,
      params: K extends 'primary'
        ? [TPrimaryPkKeys] extends [never]
          ? { pk?: {}; sk: SkParam }
          : {
              pk: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>;
              sk: SkParam;
            }
        : K extends keyof TSecondaryDerivationMap
          ? {
              pk: Pick<
                ESchemaType<TSchema>,
                TSecondaryDerivationMap[K]['pkDeps'][number] &
                  keyof ESchemaType<TSchema>
              >;
              sk: ResolveSkParam<
                ESchemaType<TSchema>,
                TSecondaryDerivationMap[K]
              >;
            }
          : never,
      options?: SimpleQueryOptions,
    ): Effect.Effect<
      { items: EntityType<ESchemaType<TSchema>>[] },
      DynamodbError,
      DynamoDB
    > =>
      Effect.gen({ self: this }, function* () {
        const { operator, skValue, scanForward } = yield* step(
          'Resolve the query bounds',
          {
            description:
              'Resolves the requested sort-key operator, value, and scan direction.',
            visibility: 'detail',
          },
          () =>
            Effect.sync(() => {
              const { operator, value: skValue } = extractKeyOp(
                params.sk as SkParam,
              );
              return {
                operator,
                skValue,
                scanForward: getKeyOpScanDirection(operator),
              };
            }),
        );

        return yield* decision(
          'Which entity index should be queried?',
          {
            description:
              'Routes the query through the primary table index or one configured secondary index.',
            attributes: { entity: this.#eschema.name },
          },
          key === 'primary',
        ).pipe(
          when(
            true,
            {
              name: 'Query the primary index',
              description:
                'Derives and queries the entity primary-index partition.',
            },
            () =>
              Effect.gen({ self: this }, function* () {
                const prepared = yield* step(
                  'Prepare the primary-index query',
                  {
                    description:
                      'Derives the primary partition, sort-key condition, and query options.',
                    visibility: 'detail',
                  },
                  () =>
                    Effect.sync(() => {
                      const derivedPk = deriveIndexKeyValue(
                        this.#eschema.name,
                        this.#primaryDerivation.pkDeps,
                        (params.pk ?? {}) as Record<string, unknown>,
                        true,
                      );
                      const skCondition: SortKeyparameter | undefined =
                        skValue !== null
                          ? operator === 'beginsWith'
                            ? { beginsWith: skValue as string }
                            : ({
                                [operator]: skValue,
                              } as SortKeyparameter)
                          : undefined;
                      const queryOptions: {
                        Limit?: number;
                        ScanIndexForward?: boolean;
                      } = { ScanIndexForward: scanForward };
                      if (options?.limit !== undefined) {
                        queryOptions.Limit = options.limit;
                      }
                      return { derivedPk, skCondition, queryOptions };
                    }),
                );
                const { Items } = yield* this.#table.query(
                  { pk: prepared.derivedPk, sk: prepared.skCondition },
                  prepared.queryOptions,
                );
                return yield* step(
                  'Decode primary-index results',
                  {
                    description:
                      'Decodes the stored primary-index items into entities.',
                    visibility: 'detail',
                  },
                  () =>
                    this.#decodeItems(Items).pipe(
                      Effect.map((items) => ({ items })),
                    ),
                );
              }),
          ),
          when(
            false,
            {
              name: 'Query a secondary index',
              description:
                'Derives and queries one configured entity secondary index.',
            },
            () =>
              Effect.gen({ self: this }, function* () {
                const prepared = yield* step(
                  'Prepare the secondary-index query',
                  {
                    description:
                      'Resolves the secondary index and derives its partition, sort-key condition, and options.',
                    visibility: 'detail',
                  },
                  () =>
                    Effect.gen({ self: this }, function* () {
                      const indexDerivation = this.#secondaryDerivations[key];
                      if (!indexDerivation) {
                        return yield* Effect.fail(
                          DynamodbError.queryFailed(
                            `Index ${String(key)} not found`,
                          ),
                        );
                      }
                      const derivedPk = deriveIndexKeyValue(
                        `${this.#eschema.name}#${indexDerivation.entityIndexName}`,
                        indexDerivation.pkDeps,
                        params.pk as Record<string, unknown>,
                        true,
                      );
                      const resolvedSkValue = this.#resolveCustomSk(
                        skValue,
                        indexDerivation,
                      );
                      const skCondition: SortKeyparameter | undefined =
                        resolvedSkValue !== null
                          ? operator === 'beginsWith'
                            ? { beginsWith: resolvedSkValue }
                            : ({
                                [operator]: resolvedSkValue,
                              } as SortKeyparameter)
                          : undefined;
                      const queryOptions: {
                        Limit?: number;
                        ScanIndexForward?: boolean;
                      } = { ScanIndexForward: scanForward };
                      if (options?.limit !== undefined) {
                        queryOptions.Limit = options.limit;
                      }
                      return {
                        indexDerivation,
                        derivedPk,
                        skCondition,
                        queryOptions,
                      };
                    }),
                );
                const { Items } = yield* this.#table.queryIndex(
                  prepared.indexDerivation.gsiName as any,
                  { pk: prepared.derivedPk, sk: prepared.skCondition },
                  prepared.queryOptions,
                );
                return yield* step(
                  'Decode secondary-index results',
                  {
                    description:
                      'Decodes the stored secondary-index items into entities.',
                    visibility: 'detail',
                  },
                  () =>
                    this.#decodeItems(Items).pipe(
                      Effect.map((items) => ({ items })),
                    ),
                );
              }),
          ),
          exhaustive,
        );
      }),
  );

  /**
   * Streams all entities from an index until exhaustion.
   * Uses cursor-based pagination to iterate through all items.
   *
   * @param key - "primary" for primary index, or the secondary index name
   * @param params - Query parameters with pk and sk (only > and < operators supported)
   * @param options - Stream options including batchSize
   * @returns A Stream that yields batches of entities
   */
  queryStream<K extends 'primary' | (keyof TSecondaryDerivationMap & string)>(
    key: K,
    params: K extends 'primary'
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: StreamSkParam }
        : {
            pk: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>;
            sk: StreamSkParam;
          }
      : K extends keyof TSecondaryDerivationMap
        ? {
            pk: Pick<
              ESchemaType<TSchema>,
              TSecondaryDerivationMap[K]['pkDeps'][number] &
                keyof ESchemaType<TSchema>
            >;
            sk: ResolveStreamSkParam<
              ESchemaType<TSchema>,
              TSecondaryDerivationMap[K]
            >;
          }
        : never,
    options?: QueryStreamOptions,
  ): Stream.Stream<
    EntityType<ESchemaType<TSchema>>[],
    DynamodbError,
    DynamoDB
  > {
    const batchSize = options?.batchSize ?? 100;
    const operator = '>' in params.sk ? '>' : '<';
    const initialSkValue = '>' in params.sk ? params.sk['>'] : params.sk['<'];

    // Resolve the initial cursor: for custom SK, derive string from object
    const indexDerivation =
      key !== 'primary' ? this.#secondaryDerivations[key] : undefined;
    const isCustomSk = indexDerivation && !indexDerivation.isTimelineSk;

    const initialCursor: string | null = isCustomSk
      ? this.#resolveCustomSk(initialSkValue, indexDerivation!)
      : (initialSkValue as string | null);

    const readPage = (cursor: string | null) =>
      Effect.gen({ self: this }, function* () {
        const skParam = { [operator]: cursor } as SkParam;

        const result = yield* this.query(
          key,
          { pk: params.pk, sk: skParam } as any,
          { limit: batchSize },
        );
        const items = result.items;
        const chunk = [items];

        if (items.length === 0 || items.length < batchSize) {
          return [chunk, Option.none<string | null>()] as const;
        }

        const lastItem = items[items.length - 1]!;
        let nextCursor: string | null;
        if (key === 'primary') {
          nextCursor = (lastItem.value as Record<string, unknown>)[
            this.#eschema.idField
          ] as string;
        } else if (isCustomSk) {
          nextCursor = this.#resolveCustomSk(lastItem.value, indexDerivation!);
        } else {
          nextCursor = lastItem.meta._u;
        }
        return [chunk, Option.some(nextCursor)] as const;
      });
    return Stream.paginate(initialCursor, readPage);
  }

  #resolveCustomSk(
    skValue: unknown,
    indexDerivation: StoredIndexDerivation,
  ): string | null {
    if (
      skValue !== null &&
      !indexDerivation.isTimelineSk &&
      typeof skValue === 'object'
    ) {
      return deriveIndexKeyValue(
        this.#eschema.name,
        indexDerivation.skDeps,
        skValue as Record<string, unknown>,
        false,
      );
    }
    return skValue as string | null;
  }

  #derivePrimaryIndex(value: any): IndexDefinition {
    return {
      pk: deriveIndexKeyValue(
        this.#eschema.name,
        this.#primaryDerivation.pkDeps,
        value,
        true,
      ),
      sk: deriveIndexKeyValue(
        this.#eschema.name,
        this.#primaryDerivation.skDeps,
        value,
        false,
      ),
    };
  }

  #deriveSecondaryIndexes(value: any): Record<string, string> {
    const indexMap: Record<string, string> = {};

    for (const [, derivation] of Object.entries(this.#secondaryDerivations)) {
      const deriv = derivation as StoredIndexDerivation;

      if (
        deriv.pkDeps.every((key: string) => typeof value[key] !== 'undefined')
      ) {
        const pkKey = `${deriv.gsiName}PK`;
        indexMap[pkKey] = deriveIndexKeyValue(
          `${this.#eschema.name}#${deriv.entityIndexName}`,
          deriv.pkDeps,
          value,
          true,
        );
      }

      if (
        deriv.skDeps.every((key: string) => typeof value[key] !== 'undefined')
      ) {
        const skKey = `${deriv.gsiName}SK`;
        indexMap[skKey] = deriveIndexKeyValue(
          this.#eschema.name,
          deriv.skDeps,
          value,
          false,
        );
      }
    }

    return indexMap;
  }

  #indexAttributeNames(): Set<string> {
    return this.#indexAttrNames;
  }

  #semanticItem(item: Record<string, unknown>): Record<string, unknown> {
    const indexAttributeNames = this.#indexAttributeNames();
    const semantic: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if (indexAttributeNames.has(key)) continue;
      if (key === '_u') continue;
      semantic[key] = value;
    }
    return semantic;
  }

  #canonicalizeDecodedValue(
    value: ESchemaType<TSchema>,
    rawItem: Record<string, unknown>,
    updateTimestamp?: string,
  ): Effect.Effect<
    {
      item: Record<string, unknown>;
      key: { pk: string; sk: string };
      semanticItem: Record<string, unknown>;
      indexAttributes: Record<string, unknown>;
    },
    DynamodbError
  > {
    return Effect.gen({ self: this }, function* () {
      const encoded = yield* this.#eschema
        .encode(value as any)
        .pipe(Effect.mapError((e) => DynamodbError.putItemFailed(e)));

      const _u = updateTimestamp ?? rawItem._u;
      const meta: MetaType = {
        _e: this.#eschema.name,
        _v: this.#eschema.latestVersion,
        _u: typeof _u === 'string' ? _u : '',
        _d: typeof rawItem._d === 'boolean' ? rawItem._d : false,
      };
      const valueWithMeta = { ...value, _u: meta._u };
      const primaryIndex = this.#derivePrimaryIndex(valueWithMeta);
      const indexAttributes = this.#deriveSecondaryIndexes(valueWithMeta);
      const item = {
        ...encoded,
        ...meta,
        [this.#table.primary.pk]: primaryIndex.pk,
        [this.#table.primary.sk]: primaryIndex.sk,
        ...indexAttributes,
      };

      return {
        item,
        key: primaryIndex,
        semanticItem: this.#semanticItem(item),
        indexAttributes,
      };
    });
  }

  #decodeItems(
    items: unknown[],
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>[], DynamodbError> {
    return Effect.all(
      items.map((item) =>
        this.#eschema.decode(item).pipe(
          Effect.map((value) => ({
            value: value as ESchemaType<TSchema>,
            meta: Schema.decodeUnknownSync(metaSchema)(item),
          })),
          Effect.mapError((e) => DynamodbError.queryFailed(e)),
        ),
      ),
    );
  }

  #prepareInsert(
    fullValue: ESchemaType<TSchema>,
    condition?: ConditionInput<ESchemaType<TSchema>>,
  ): Effect.Effect<
    {
      exprResult: ConditionExprResult;
      fullValue: ESchemaType<TSchema>;
      restamp: (u: string) => {
        item: Record<string, unknown>;
        meta: MetaType;
      };
    },
    DynamodbError
  > {
    return Effect.gen({ self: this }, function* () {
      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => DynamodbError.putItemFailed(e)));

      const restamp = (_u: string) => {
        const meta: MetaType = {
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
          _d: false,
        };

        const valueWithMeta = { ...fullValue, _u };
        const primaryIndex = this.#derivePrimaryIndex(valueWithMeta);
        const indexMap = this.#deriveSecondaryIndexes(valueWithMeta);

        const item = {
          ...encoded,
          ...meta,
          [this.#table.primary.pk]: primaryIndex.pk,
          [this.#table.primary.sk]: primaryIndex.sk,
          ...indexMap,
        };

        return { item, meta };
      };

      const resolvedCondition = condition
        ? resolveCondition(condition)
        : undefined;

      const exprResult = buildExpr({
        condition: exprCondition(($) =>
          $.and(
            ...([
              resolvedCondition,
              $.attributeNotExists(this.#table.primary.pk as any),
              $.attributeNotExists(this.#table.primary.sk as any),
            ].filter(Boolean) as ConditionOperation[]),
          ),
        ),
      });

      return { exprResult, fullValue, restamp };
    });
  }

  #handleConditionFailure(
    error: DynamodbError,
    autoMigrate: boolean,
    userCondition?: ConditionInput<ESchemaType<TSchema>>,
  ): Effect.Effect<
    | { Attributes: Record<string, unknown> | null }
    | { _retry: true; Attributes: null },
    DynamodbError,
    DynamoDB
  > {
    const existingItem = extractConditionFailureItem(error);
    const outcome = !existingItem
      ? 'missing'
      : existingItem._v === this.#eschema.latestVersion
        ? 'current'
        : autoMigrate
          ? 'migrate'
          : 'stale';

    return decision(
      'Resolve DynamoDB conditional update failure',
      {
        description:
          'Classifies a failed guarded update as missing, condition-rejected, stale, or eligible for automatic migration.',
        attributes: { entity: this.#eschema.name },
      },
      outcome,
    ).pipe(
      when(
        'missing',
        { description: 'Reports that the target item does not exist.' },
        () => Effect.fail(DynamodbError.noItemToUpdate()),
      ),
      when(
        'current',
        {
          description:
            'Reports the caller condition or missing-item guard that rejected the current schema version.',
        },
        () =>
          Effect.fail(this.#currentConditionError(userCondition !== undefined)),
      ),
      when(
        'stale',
        {
          description:
            'Reports a schema-version mismatch because automatic migration is disabled.',
        },
        () => Effect.fail(DynamodbError.itemVersionMismatch()),
      ),
      when(
        'migrate',
        {
          description:
            'Migrates the stale item to the latest schema and asks the update path to retry once.',
        },
        () =>
          this.#ensureLatestVersion(existingItem!).pipe(
            Effect.map(() => ({ _retry: true as const, Attributes: null })),
          ),
      ),
      exhaustive,
    );
  }

  #ensureLatestVersion(
    rawItem: Record<string, unknown>,
  ): Effect.Effect<void, DynamodbError, DynamoDB> {
    return Effect.gen({ self: this }, function* () {
      const decoded = yield* this.#eschema
        .decode(rawItem)
        .pipe(Effect.mapError((e) => DynamodbError.itemMigrationFailed(e)));

      const canonical = yield* this.#canonicalizeDecodedValue(
        decoded as ESchemaType<TSchema>,
        rawItem,
        typeof rawItem._u === 'string' ? rawItem._u : yield* nextUlid,
      ).pipe(Effect.mapError((e) => DynamodbError.itemMigrationFailed(e)));

      const oldVersion = rawItem._v;
      const conditionExpr = buildExpr({
        condition: exprCondition(($) =>
          $.cond('_v' as any, '=', oldVersion as any),
        ),
      });

      yield* this.#table
        .putItem(canonical.item, {
          ...conditionExpr,
        })
        .pipe(
          Effect.catchIf(
            (e): e is DynamodbError =>
              e.error._tag === 'PutItemFailed' && isConditionalCheckFailed(e),
            () =>
              Effect.fail(
                DynamodbError.itemMigrationFailed(
                  'Concurrent write detected during migration',
                ),
              ),
          ),
        );
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

  #resolveUpdateInput(
    update: UpdateInput<ESchemaType<TSchema>>,
    current: ESchemaType<TSchema>,
  ) {
    return typeof update === 'function' ? update(current) : update;
  }

  #currentConditionError(hasUserCondition: boolean): DynamodbError {
    return hasUserCondition
      ? DynamodbError.conditionCheckFailed()
      : DynamodbError.noItemToUpdate();
  }

  #mapRetryUpdateError(
    error: DynamodbError,
    hasUserCondition: boolean,
  ): DynamodbError {
    if (
      error.error._tag === 'UpdateItemFailed' &&
      isConditionalCheckFailed(error)
    ) {
      return this.#currentConditionError(hasUserCondition);
    }
    return error;
  }

  #prepareUpdate(
    keyValue: Record<string, unknown>,
    updates: Partial<Omit<ESchemaType<TSchema>, '_v'>>,
    condition?: ConditionInput<ESchemaType<TSchema>>,
    expectedU?: string,
    existingDeleted = false,
  ): Effect.Effect<
    {
      pk: string;
      sk: string;
      restamp: (u: string) => { exprResult: UpdateExprResult; meta: MetaType };
    },
    DynamodbError
  > {
    return Effect.gen({ self: this }, function* () {
      const pk = deriveIndexKeyValue(
        this.#eschema.name,
        this.#primaryDerivation.pkDeps,
        keyValue,
        true,
      );
      const sk = deriveIndexKeyValue(
        this.#eschema.name,
        this.#primaryDerivation.skDeps,
        keyValue,
        false,
      );

      const { _d, _e, _v, _u: _uInput, ...entityUpdates } = updates as any;

      const encodedUpdates = yield* (
        Schema.encodeEffect(
          this.#eschema.schema.mapFields(Struct.map(Schema.optional)),
        )(entityUpdates) as Effect.Effect<
          Record<string, unknown>,
          unknown,
          never
        >
      ).pipe(Effect.mapError((e) => DynamodbError.updateItemFailed(e)));

      const builtCondition = this.#buildUpdateCondition(condition, expectedU);

      const restamp = (_u: string) => {
        const updatesWithMeta = { ...encodedUpdates, _u };
        const indexMap = this.#deriveSecondaryIndexes(updatesWithMeta);

        const meta: MetaType = {
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
          _d: _d ?? existingDeleted,
        };

        const update = exprUpdate<any>(($) => [
          ...Object.entries({ ...encodedUpdates, ...indexMap }).map(
            ([key, v]) => $.set(key, v),
          ),
          $.set('_u', _u),
          ...(_d !== undefined ? [$.set('_d', _d)] : []),
        ]);

        const exprResult = buildExpr({
          update,
          condition: builtCondition,
        });

        return { exprResult, meta };
      };

      return { pk, sk, restamp };
    });
  }

  #prepareUpdateExpr(
    keyValue: Record<string, unknown>,
    builder: (ops: UpdateOps<any>) => AnyOperation<any>[],
    condition?: ConditionInput<ESchemaType<TSchema>>,
    expectedU?: string,
    existingDeleted = false,
  ): Effect.Effect<
    {
      pk: string;
      sk: string;
      restamp: (u: string) => { exprResult: UpdateExprResult; meta: MetaType };
    },
    DynamodbError
  > {
    return Effect.gen({ self: this }, function* () {
      const { pk, sk } = this.#derivePrimaryIndex(keyValue);

      const userOps = exprUpdate<any>(builder);
      const touchedKeys = extractKeysFromOps(userOps);

      for (const key of touchedKeys) {
        if (this.#derivationDeps.has(key)) {
          return yield* Effect.fail(
            DynamodbError.updateItemFailed(
              `Cannot use expression builder to update "${key}" because it is a derivation dependency. Use a plain partial update instead.`,
            ),
          );
        }
      }

      const builtCondition = this.#buildUpdateCondition(condition, expectedU);

      const restamp = (_u: string) => {
        const indexMap = this.#deriveSecondaryIndexes({ _u });

        const meta: MetaType = {
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
          _d: existingDeleted,
        };

        const update = exprUpdate<any>(($) => [
          ...userOps,
          ...Object.entries(indexMap).map(([key, v]) => $.set(key, v)),
          $.set('_u', _u),
        ]);

        const exprResult = buildExpr({
          update,
          condition: builtCondition,
        });

        return { exprResult, meta };
      };

      return { pk, sk, restamp };
    });
  }
}

/**
 * Builder class for configuring entity index derivations.
 */
export class EntityIndexDerivations<
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
> {
  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: {
    pk: readonly (keyof ESchemaType<TSchema>)[];
    sk: readonly (keyof ESchemaType<TSchema>)[];
  };
  #secondaryDerivations: TSecondaryDerivationMap;
  #onBuild: ((entity: DynamoEntity<any, any, any, any>) => void) | undefined;

  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: {
      pk: readonly (keyof ESchemaType<TSchema>)[];
      sk: readonly (keyof ESchemaType<TSchema>)[];
    },
    definitions: TSecondaryDerivationMap,
    onBuild?: (entity: DynamoEntity<any, any, any, any>) => void,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = definitions;
    this.#onBuild = onBuild;
  }

  /**
   * Maps a table GSI to a semantic entity index with custom derivation.
   * SK defaults to `_u` if not specified.
   *
   * @typeParam GsiName - The GSI name on the table
   * @typeParam TPkKeys - Fields used for partition key derivation
   * @typeParam TSkKeys - Fields used for sort key derivation (defaults to ["_u"])
   * @param gsiName - The GSI name on the table (e.g., "GSI1")
   * @param entityIndexName - The semantic name for this entity's use of the GSI (e.g., "byEmail")
   * @param derivation - The pk and optional sk field arrays
   * @returns A builder with the index mapping added
   */
  index<
    GsiName extends keyof TTable['secondaryIndexMap'] & string,
    const TEntityIndexName extends string,
    const TPkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[],
    const TSkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[] = readonly ['_u'],
  >(
    gsiName: GsiName,
    entityIndexName: TEntityIndexName,
    derivation: {
      pk: TPkKeys;
      sk?: TSkKeys;
    },
  ) {
    const skKeys = (derivation.sk ?? ['_u']) as TSkKeys;
    const isTimelineSk = skKeys.length === 1 && skKeys[0] === '_u';
    const newDeriv: StoredIndexDerivation = {
      gsiName,
      entityIndexName,
      pkDeps: derivation.pk.map(String),
      skDeps: (skKeys as readonly (string | symbol | number)[]).map(String),
      isTimelineSk,
    };

    return new EntityIndexDerivations(
      this.#table,
      this.#eschema,
      this.#primaryDerivation,
      {
        ...this.#secondaryDerivations,
        [entityIndexName]: newDeriv,
      },
      this.#onBuild,
    ) as EntityIndexDerivations<
      TTable,
      TSchema,
      TPrimaryPkKeys,
      TSecondaryDerivationMap &
        Record<
          TEntityIndexName,
          StoredIndexDerivation & {
            pkDeps: TPkKeys;
            skDeps: TSkKeys;
            isTimelineSk: IsTimelineSk<TSkKeys>;
          }
        >
    >;
  }

  /**
   * Builds the final DynamoEntity instance.
   *
   * @returns The configured DynamoEntity
   */
  build() {
    const storedPrimary: StoredPrimaryDerivation = {
      pkDeps: this.#primaryDerivation.pk.map(String),
      skDeps: this.#primaryDerivation.sk.map(String),
    };

    const entity = new DynamoEntity<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >(this.#table, this.#eschema, storedPrimary, this.#secondaryDerivations);
    this.#onBuild?.(entity);
    return entity;
  }
}
