import { Chunk, Effect, Option, Stream } from 'effect';
import type { DynamoTable } from './dynamo-table.js';
import type { DynamoEntity } from './dynamo-entity.js';
import type { DynamoSingleEntity } from './dynamo-single-entity.js';
import type {
  MigrationOptions,
  MigrationReport,
  TransactItem,
} from '../types/index.js';
import type {
  DescriptorProvider,
  EntityType,
  RegistrySchema,
} from '@std-toolkit/core';
import { ConnectionService } from '@std-toolkit/core/server';
import { DynamodbError } from '../errors.js';
import {
  createMigrationReportAccumulator,
  extractTableKey,
} from '../internal/index.js';
import { buildExpr } from '../expr/build-expr.js';
import { exprCondition } from '../expr/condition.js';

const MIGRATION_RETRY_LIMIT = 3;

/**
 * Extracts the entity name from a DynamoEntity type.
 */
type EntityName<T> =
  T extends DynamoEntity<any, any, infer TSchema, any>
    ? TSchema['name']
    : never;

/**
 * Extracts the entity name from a DynamoSingleEntity type.
 */
type SingleEntityName<T> =
  T extends DynamoSingleEntity<any, infer TSchema> ? TSchema['name'] : never;

/**
 * Type for a map of entity names to DynamoEntity instances.
 */
type EntitiesMap<TTable extends DynamoTable<any, any>> = Record<
  string,
  DynamoEntity<TTable, any, any, any>
>;

/**
 * Type for a map of entity names to DynamoSingleEntity instances.
 */
type SingleEntitiesMap<TTable extends DynamoTable<any, any>> = Record<
  string,
  DynamoSingleEntity<TTable, any>
>;

/**
 * Registry for managing multiple entities within a single DynamoDB table.
 * Implements DescriptorProvider for unified schema access across database types.
 * Provides type-safe access to entities and cross-entity transactions.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TEntities - Map of entity names to entity instances
 */
export class EntityRegistry<
  TTable extends DynamoTable<any, any>,
  TEntities extends EntitiesMap<TTable>,
  TSingleEntities extends SingleEntitiesMap<TTable> = {},
> implements DescriptorProvider {
  /**
   * Creates a new entity registry builder for the given table.
   *
   * @typeParam TTable - The DynamoTable instance type
   * @param table - The DynamoTable instance
   * @returns A builder to register entities
   */
  static make<TTable extends DynamoTable<any, any>>(table: TTable) {
    return new EntityRegistryBuilder<TTable, {}, {}>(table, {}, {});
  }

  #table: TTable;
  #entities: TEntities;
  #singleEntities: TSingleEntities;

  constructor(
    table: TTable,
    entities: TEntities,
    singleEntities: TSingleEntities,
  ) {
    this.#table = table;
    this.#entities = entities;
    this.#singleEntities = singleEntities;
  }

  /**
   * Executes a transaction with type-safe entity validation.
   * Only accepts TransactItems from entities registered in this registry.
   * Broadcasts all entity changes after successful transaction.
   *
   * @param items - Array of transaction items from registered entities
   * @returns Effect that completes when the transaction succeeds
   */
  transact(
    items: TransactItem<
      | EntityName<TEntities[keyof TEntities]>
      | SingleEntityName<TSingleEntities[keyof TSingleEntities]>
    >[],
  ): Effect.Effect<EntityType<unknown>[], DynamodbError> {
    return Effect.gen(this, function* () {
      yield* this.#table.transact(items);

      const connectionService = yield* Effect.serviceOption(
        ConnectionService,
      ).pipe(Effect.andThen(Option.getOrNull));

      const entities: EntityType<unknown>[] = [];
      for (const item of items) {
        if (item.broadcast) {
          entities.push(item.broadcast);
          connectionService?.broadcast(item.broadcast);
        }
      }
      return entities;
    });
  }

  /**
   * Gets the schema including all registered entity descriptors.
   * Single entities are excluded — they have no index pattern visualization.
   */
  getSchema(): RegistrySchema {
    return {
      descriptors: Object.values(this.#entities).map((entity) =>
        entity.getDescriptor(),
      ),
    };
  }

  /**
   * Accesses a registered entity by its name.
   *
   * @typeParam K - The entity name key
   * @param name - The entity name
   * @returns The entity instance
   */
  entity<K extends keyof TEntities>(name: K): TEntities[K] {
    return this.#entities[name];
  }

  /**
   * Accesses a registered single entity by its name.
   *
   * @typeParam K - The single entity name key
   * @param name - The single entity name
   * @returns The single entity instance
   */
  singleEntity<K extends keyof TSingleEntities>(name: K): TSingleEntities[K] {
    return this.#singleEntities[name];
  }

  /**
   * Gets all registered entity names (both regular and single entities).
   */
  get entityNames(): (keyof TEntities | keyof TSingleEntities)[] {
    return [
      ...Object.keys(this.#entities),
      ...Object.keys(this.#singleEntities),
    ] as (keyof TEntities | keyof TSingleEntities)[];
  }

  migrateStream(
    options: MigrationOptions = {},
  ): Stream.Stream<MigrationReport, DynamodbError> {
    const effectiveOptions: MigrationOptions = {
      ...options,
      dryRun: options.dryRun ?? true,
    };
    const scanOptions = {
      pageLimit: effectiveOptions.scan?.pageLimit ?? effectiveOptions.batchSize,
      totalSegments: effectiveOptions.scan?.totalSegments ?? 1,
      consistentRead: effectiveOptions.scan?.consistentRead,
    };
    const itemConcurrency = effectiveOptions.concurrency?.itemsPerSegment ?? 1;
    const progressEstimate = (() => {
      if (typeof effectiveOptions.progress?.estimatedTotal === 'number') {
        return Effect.succeed({
          total: effectiveOptions.progress.estimatedTotal,
          approximate: false,
        });
      }
      if (effectiveOptions.progress?.estimatedTotal === false) {
        return Effect.succeed(undefined);
      }
      return this.#table.describe().pipe(
        Effect.map((description) =>
          typeof description.estimatedItemCount === 'number'
            ? {
                total: description.estimatedItemCount,
                approximate: true,
              }
            : undefined,
        ),
      );
    })();

    return Stream.fromEffect(progressEstimate).pipe(
      Stream.flatMap((resolvedProgressEstimate) => {
        const accumulator = createMigrationReportAccumulator(
          effectiveOptions,
          resolvedProgressEstimate,
        );
        const entityFilter = effectiveOptions.entities
          ? new Set(effectiveOptions.entities)
          : undefined;

        const inspectRow = (
          segmentKey: string,
          item: Record<string, unknown>,
        ) =>
          Effect.gen(this, function* () {
            const entityName =
              typeof item._e === 'string' ? item._e : undefined;

            if (!entityName) {
              accumulator.recordScanned({ segment: segmentKey });
              accumulator.recordIgnored();
              return;
            }

            if (entityFilter && !entityFilter.has(entityName)) {
              accumulator.recordScanned({ segment: segmentKey });
              accumulator.recordIgnored();
              return;
            }

            const entity =
              this.#entities[entityName] ?? this.#singleEntities[entityName];
            const isRegularEntity = Boolean(this.#entities[entityName]);

            if (!entity) {
              accumulator.recordScanned({ segment: segmentKey });
              accumulator.recordIgnored();
              return;
            }

            accumulator.recordScanned({
              entity: entityName,
              segment: segmentKey,
            });
            const inspection = yield* entity.inspectMigration(item);
            accumulator.recordInspection(inspection);

            if (
              effectiveOptions.dryRun ||
              typeof inspection.state !== 'object' ||
              inspection.state.type !== 'stale'
            ) {
              return;
            }

            const storedKey =
              inspection.storedKey ??
              extractTableKey(item, this.#table.primary);
            const writeIntent = yield* entity.migrationWriteIntent(item);
            if (!writeIntent || !storedKey) {
              return;
            }

            const writeResult = yield* this.#writeMigrationItemWithRetry({
              entity,
              entityName,
              scannedItem: item,
              storedKey,
              canonicalItem: writeIntent.item,
              regular: isRegularEntity,
            }).pipe(Effect.either);

            if (writeResult._tag === 'Right') {
              if (writeResult.right === 'migrated') {
                accumulator.recordMigrated({ entity: entityName });
              }
              return;
            }

            accumulator.recordFailed({ entity: entityName });
          });

        const scanSegment = (segment: number) => {
          const segmentKey = String(segment);

          return Stream.paginateChunkEffect<
            { lastKey?: Record<string, unknown> },
            MigrationReport,
            DynamodbError,
            never
          >({}, ({ lastKey }) =>
            Effect.gen(this, function* () {
              const scanInput = {
                ...(scanOptions.pageLimit
                  ? { Limit: scanOptions.pageLimit }
                  : {}),
                ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
                ...(scanOptions.totalSegments > 1
                  ? {
                      Segment: segment,
                      TotalSegments: scanOptions.totalSegments,
                    }
                  : {}),
                ...(scanOptions.consistentRead !== undefined
                  ? { ConsistentRead: scanOptions.consistentRead }
                  : {}),
              };
              const pageResult = yield* this.#scanMigrationPageWithRetry(
                scanInput,
              ).pipe(Effect.either);

              if (pageResult._tag === 'Left') {
                accumulator.recordSegmentFailed(segmentKey);
                return [
                  Chunk.of(accumulator.snapshot()),
                  Option.none<{ lastKey?: Record<string, unknown> }>(),
                ];
              }

              const page = pageResult.right;

              yield* Effect.forEach(
                page.Items,
                (item) => inspectRow(segmentKey, item),
                { concurrency: itemConcurrency, discard: true },
              );

              if (page.LastEvaluatedKey) {
                return [
                  Chunk.of(accumulator.snapshot()),
                  Option.some({ lastKey: page.LastEvaluatedKey }),
                ];
              }

              accumulator.completeSegment(segmentKey);
              return [
                Chunk.of(accumulator.snapshot()),
                Option.none<{ lastKey?: Record<string, unknown> }>(),
              ];
            }),
          );
        };

        const segments = Array.from(
          { length: scanOptions.totalSegments },
          (_, segment) => scanSegment(segment),
        );
        const scanReports = Stream.mergeAll(segments, {
          concurrency: scanOptions.totalSegments,
        }).pipe(
          Stream.concat(
            Stream.fromEffect(
              Effect.sync(() => {
                accumulator.complete();
                return accumulator.snapshot();
              }),
            ),
          ),
        );

        return Stream.make(accumulator.snapshot()).pipe(
          Stream.concat(scanReports),
        );
      }),
    );
  }

  migrate(
    options: MigrationOptions = {},
  ): Effect.Effect<MigrationReport, DynamodbError> {
    return this.migrateStream(options).pipe(
      Stream.runLast,
      Effect.map(Option.getOrThrow),
    );
  }

  /**
   * Gets the underlying table instance.
   */
  get table(): TTable {
    return this.#table;
  }

  #putMigrationItem(options: {
    scannedItem: Record<string, unknown>;
    storedKey: { pk: string; sk: string };
    canonicalItem: Record<string, unknown>;
    regular: boolean;
  }): Effect.Effect<void, DynamodbError> {
    const condition = this.#migrationPutCondition(options);
    return this.#table
      .putItem(options.canonicalItem, condition)
      .pipe(Effect.asVoid);
  }

  #scanMigrationPageWithRetry(
    options: {
      Limit?: number;
      ExclusiveStartKey?: Record<string, unknown>;
      Segment?: number;
      TotalSegments?: number;
      ConsistentRead?: boolean;
    },
    attempt = 0,
  ): Effect.Effect<
    {
      Items: Record<string, unknown>[];
      LastEvaluatedKey?: Record<string, unknown>;
    },
    DynamodbError
  > {
    return Effect.gen(this, function* () {
      const result = yield* this.#table.scan(options).pipe(Effect.either);

      if (result._tag === 'Right') {
        return result.right;
      }

      if (
        this.#isRecoverableDynamoFailure(result.left) &&
        attempt < MIGRATION_RETRY_LIMIT
      ) {
        return yield* this.#scanMigrationPageWithRetry(options, attempt + 1);
      }

      return yield* Effect.fail(result.left);
    });
  }

  #writeMigrationItemWithRetry(options: {
    entity:
      | DynamoEntity<TTable, any, any, any>
      | DynamoSingleEntity<TTable, any>;
    entityName: string;
    scannedItem: Record<string, unknown>;
    storedKey: { pk: string; sk: string };
    canonicalItem: Record<string, unknown>;
    regular: boolean;
    attempt?: number;
  }): Effect.Effect<'migrated' | 'resolved', DynamodbError> {
    const attempt = options.attempt ?? 0;

    return Effect.gen(this, function* () {
      const result = yield* this.#putMigrationItem(options).pipe(Effect.either);

      if (result._tag === 'Right') {
        return 'migrated' as const;
      }

      if (
        this.#isConditionalConflict(result.left) &&
        attempt < MIGRATION_RETRY_LIMIT
      ) {
        const current = yield* this.#table.getItem(options.storedKey, {
          ConsistentRead: true,
        });

        if (!current.Item) {
          return 'resolved' as const;
        }

        const inspection = yield* options.entity.inspectMigration(current.Item);
        if (
          typeof inspection.state !== 'object' ||
          inspection.state.type !== 'stale'
        ) {
          return 'resolved' as const;
        }

        const writeIntent = yield* options.entity.migrationWriteIntent(
          current.Item,
        );
        if (!writeIntent) {
          return 'resolved' as const;
        }

        return yield* this.#writeMigrationItemWithRetry({
          ...options,
          scannedItem: current.Item,
          canonicalItem: writeIntent.item,
          attempt: attempt + 1,
        });
      }

      if (
        this.#isRecoverableDynamoFailure(result.left) &&
        attempt < MIGRATION_RETRY_LIMIT
      ) {
        return yield* this.#writeMigrationItemWithRetry({
          ...options,
          attempt: attempt + 1,
        });
      }

      return yield* Effect.fail(result.left);
    });
  }

  #isConditionalConflict(error: unknown): boolean {
    return this.#containsDynamoError(error, (tag, details) => {
      if (tag === 'ConditionCheckFailed') {
        return true;
      }
      return (
        tag === 'UnknownAwsError' &&
        details.name === 'ConditionalCheckFailedException'
      );
    });
  }

  #isRecoverableDynamoFailure(error: unknown): boolean {
    return this.#containsDynamoError(
      error,
      (tag) =>
        tag === 'ThrottlingException' ||
        tag === 'ServiceUnavailable' ||
        tag === 'RequestTimeout',
    );
  }

  #containsDynamoError(
    error: unknown,
    predicate: (tag: string, details: Record<string, unknown>) => boolean,
  ): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const dynamoError = error as {
      error?: { _tag?: string; cause?: unknown } & Record<string, unknown>;
    };
    const errorDetails = dynamoError.error;
    const tag = errorDetails?._tag;
    if (tag && errorDetails && predicate(tag, errorDetails)) {
      return true;
    }

    if (errorDetails && 'cause' in errorDetails) {
      return this.#containsDynamoError(errorDetails.cause, predicate);
    }

    return false;
  }

  #migrationPutCondition({
    scannedItem,
    storedKey,
    regular,
  }: {
    scannedItem: Record<string, unknown>;
    storedKey: { pk: string; sk: string };
    regular: boolean;
  }) {
    const pk = this.#table.primary.pk;
    const sk = this.#table.primary.sk;
    const entityName = scannedItem._e;
    const scannedUpdate = scannedItem._u;
    const scannedDeleted = scannedItem._d;

    return buildExpr({
      condition: exprCondition(($) =>
        $.and(
          $.cond(pk as any, '=', storedKey.pk),
          $.cond(sk as any, '=', storedKey.sk),
          $.cond('_e' as any, '=', entityName),
          $.cond('_u' as any, '=', scannedUpdate),
          ...(regular
            ? [
                typeof scannedDeleted === 'boolean'
                  ? $.cond('_d' as any, '=', scannedDeleted)
                  : $.attributeNotExists('_d' as any),
              ]
            : []),
        ),
      ),
    });
  }
}

/**
 * Builder class for constructing an EntityRegistry with registered entities.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TEntities - Map of entity names to entity instances
 */
class EntityRegistryBuilder<
  TTable extends DynamoTable<any, any>,
  TEntities extends EntitiesMap<TTable>,
  TSingleEntities extends SingleEntitiesMap<TTable>,
> {
  #table: TTable;
  #entities: TEntities;
  #singleEntities: TSingleEntities;

  constructor(
    table: TTable,
    entities: TEntities,
    singleEntities: TSingleEntities,
  ) {
    this.#table = table;
    this.#entities = entities;
    this.#singleEntities = singleEntities;
  }

  /**
   * Registers an entity with this entity registry.
   * The entity name is automatically extracted from its schema.
   *
   * @typeParam TEntity - The DynamoEntity type to register
   * @param entity - The entity instance to register
   * @returns A builder with the entity registered
   */
  register<TEntity extends DynamoEntity<TTable, any, any, any>>(
    entity: TEntity,
  ): EntityRegistryBuilder<
    TTable,
    TEntities & Record<EntityName<TEntity>, TEntity>,
    TSingleEntities
  > {
    return new EntityRegistryBuilder(
      this.#table,
      {
        ...this.#entities,
        [entity.name]: entity,
      } as TEntities & Record<EntityName<TEntity>, TEntity>,
      this.#singleEntities,
    );
  }

  /**
   * Registers a single entity with this entity registry.
   * The entity name is automatically extracted from its schema.
   *
   * @typeParam TEntity - The DynamoSingleEntity type to register
   * @param entity - The single entity instance to register
   * @returns A builder with the single entity registered
   */
  registerSingle<TEntity extends DynamoSingleEntity<TTable, any>>(
    entity: TEntity,
  ): EntityRegistryBuilder<
    TTable,
    TEntities,
    TSingleEntities & Record<SingleEntityName<TEntity>, TEntity>
  > {
    return new EntityRegistryBuilder(this.#table, this.#entities, {
      ...this.#singleEntities,
      [entity.name]: entity,
    } as TSingleEntities & Record<SingleEntityName<TEntity>, TEntity>);
  }

  /**
   * Builds the final EntityRegistry instance.
   *
   * @returns The configured EntityRegistry
   */
  build(): EntityRegistry<TTable, TEntities, TSingleEntities> {
    return new EntityRegistry(
      this.#table,
      this.#entities,
      this.#singleEntities,
    );
  }
}
