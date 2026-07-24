import type { AnyEntityESchema, ESchemaType } from '../../../eschema/index.js';
import { Effect, Option, Schema, Stream } from 'effect';
import type { SQLiteTableInstance, SortKeyCondition } from './sqlite-table.js';
import { SqliteDB, SqliteDBError } from '../sql/db.js';
import * as Sql from '../sql/helpers/index.js';
import {
  deriveIndexKeyValue,
  extractKeyOp,
  getKeyOpScanDirection,
  sqlMetaSchema,
  type RawRow,
  type RowMeta,
  type SkParam,
  type StreamSkParam,
  type CustomSkParam,
  type CustomStreamSkParam,
  type SimpleQueryOptions,
  type QueryStreamOptions,
  type StoredIndexDerivation,
  type StoredPrimaryDerivation,
} from '../internal/utils.js';
import { Broadcaster, nextUlid } from '../../../core/index.js';
import type { Prettify } from '../../../eschema/index.js';

/**
 * Meta fields that can be used in index derivations.
 */
type DerivableMetaFields = '_u';

/**
 * Type-level check: is this SK tuple exactly ["_u"]?
 */
type IsTimelineSk<T extends readonly unknown[]> = T extends readonly ['_u']
  ? true
  : false;

/**
 * Resolves the SK param type for a secondary index based on isTimelineSk.
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
 * Represents an entity item with its value and metadata.
 *
 * @typeParam T - The entity value type
 */
export interface EntityType<T> {
  /** The entity data */
  value: T;
  /** Metadata about the entity item */
  meta: RowMeta;
}

/**
 * A single write inside `transact`. `insert` fails if the row already exists;
 * `update` fails unless the stored row's `_u` still equals `expectedU`
 * (optimistic concurrency; omitted for `lastWriteWins` ops). Either failure
 * aborts the whole transaction.
 */
export type SqliteWriteOp =
  | {
      type: 'insert';
      key: { pk: string; sk: string };
      values: Record<string, unknown>;
    }
  | {
      type: 'update';
      key: { pk: string; sk: string };
      values: Record<string, unknown>;
      expectedU?: string;
    };

/**
 * A deferred write produced by `insertOp`/`getAndUpdateOp`, consumed by the table's
 * `transact`. `apply` is pure — the transaction supplies the write cursor and
 * gets back the concrete write plus the broadcast payload, flushed only after
 * the transaction commits. `table` identifies where the op was built so
 * `transact` can reject foreign ops.
 */
export interface SqliteEntityOp {
  readonly entityName: string;
  readonly operationKind: 'insertOp' | 'updateOp' | 'deleteOp' | 'restoreOp';
  readonly pk: string;
  readonly sk: string;
  readonly table: unknown;
  readonly apply: (u: string) => {
    write: SqliteWriteOp;
    entity: EntityType<unknown>;
  };
}

/**
 * Helper type to extract the key type from an array of keys.
 */
type ExtractKeys<T, Keys extends readonly (keyof T)[]> = Keys[number];

/**
 * Helper type to extract key value fields.
 */
type IndexKeyFields<T, K extends keyof T | DerivableMetaFields> = Pick<
  T,
  K & keyof T
>;

/**
 * A SQLite entity with type-safe CRUD operations and automatic index derivation.
 * Entities are built on top of a SQLiteTable and use an ESchema for validation.
 */
export class SQLiteEntity<
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
> {
  /**
   * Creates a new entity builder for the given table.
   *
   * @typeParam TTable - The SQLiteTable instance type
   * @param table - The SQLiteTable instance
   * @returns A builder to configure the entity schema
   */
  static make<TTable extends SQLiteTableInstance>(
    table: TTable,
    onBuild?: (entity: SQLiteEntity<any, any, any>) => void,
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

  #table: SQLiteTableInstance;
  #eschema: TSchema;
  #primaryDerivation: StoredPrimaryDerivation;
  #secondaryDerivations: TSecondaryDerivationMap;

  constructor(
    table: SQLiteTableInstance,
    eschema: TSchema,
    primaryDerivation: StoredPrimaryDerivation,
    secondaryDerivations: TSecondaryDerivationMap,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = secondaryDerivations;
  }

  /**
   * Gets the entity name from the schema.
   */
  get name(): TSchema['name'] {
    return this.#eschema.name;
  }

  /**
   * Gets the ID field name from the schema.
   */
  get idField(): TSchema['idField'] {
    return this.#eschema.idField;
  }

  /**
   * Retrieves an entity by its primary key fields.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The entity if found, or null
   */
  get(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>> | null,
    SqliteDBError,
    SqliteDB
  > {
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

      const { Item } = yield* this.#table.getItem({ pk, sk });

      if (!Item) return null;

      return yield* this.#parseRow(Item);
    }).pipe(
      Effect.withSpan('sqlite.entity.get', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * Inserts a new entity.
   *
   * @param value - The entity value to insert
   * @returns The inserted entity with metadata
   */
  insert(
    value: InsertInput<ESchemaType<TSchema>>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const { item, meta } = yield* this.#prepareInsert(fullValue);

      yield* this.#table.putItem(item).pipe(
        Effect.catch((error) =>
          Effect.gen({ self: this }, function* () {
            const existing = yield* this.get(fullValue).pipe(
              Effect.catch(() => Effect.succeed(null)),
            );
            return yield* Effect.fail(
              existing
                ? SqliteDBError.itemAlreadyExists(
                    (yield* SqliteDB).tableName,
                    error,
                  )
                : error,
            );
          }),
        ),
      );

      yield* this.#broadcast([{ value: fullValue, meta }]);

      return { value: fullValue, meta };
    }).pipe(
      Effect.withSpan('sqlite.entity.insert', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * The portable read-modify-write: reads the current entity, derives a
   * partial from it, and writes the full merged record back guarded on the
   * `_u` that was read. On a concurrent-write conflict, re-reads and re-runs
   * up to `retries` times (default 3) before failing with `conditionFailed`.
   * A callback returning `null` skips the write and resolves with the
   * current entity. `lastWriteWins: true` drops the guard.
   *
   * @param keyValue - Object containing the primary key field values
   * @param update - Partial entity, or a callback deriving one from the current value
   * @param config - Retry count and guard opt-out
   * @returns The updated entity with new metadata
   */
  getAndUpdate(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    update: UpdateInput<ESchemaType<TSchema>>,
    config?: GetAndUpdateConfig,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const retries = config?.retries ?? 3;
      for (let attempt = 0; ; attempt++) {
        const existing = yield* this.get(keyValue);
        if (!existing) {
          return yield* Effect.fail(
            SqliteDBError.noItemToUpdate((yield* SqliteDB).tableName),
          );
        }

        const partial =
          typeof update === 'function' ? update(existing.value) : update;
        if (partial === null) return existing;

        const fullValue = {
          ...existing.value,
          ...partial,
        } as ESchemaType<TSchema>;

        const { encoded, meta } = yield* this.#encode(
          fullValue,
          existing.meta._d,
        );

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

        const updateValues: Record<string, unknown> = {
          _data: JSON.stringify(encoded),
          _v: meta._v,
          _u: meta._u,
          ...this.#deriveSecondaryIndexes({ ...fullValue, _u: meta._u }),
        };

        if (config?.lastWriteWins) {
          yield* this.#table.updateItem({ pk, sk }, updateValues);
        } else {
          const db = yield* SqliteDB;
          const where = Sql.whereAnd(
            Sql.wherePkSkExact(
              this.#table.primary.pk,
              this.#table.primary.sk,
              pk,
              sk,
            ),
            Sql.where('_u', '=', existing.meta._u),
          );
          const { rowsWritten } = yield* db.update(
            db.tableName,
            updateValues,
            where,
          );
          if (rowsWritten === 0) {
            if (attempt < retries) continue;
            return yield* Effect.fail(
              SqliteDBError.conditionFailed(db.tableName, { pk, sk }),
            );
          }
        }

        yield* this.#broadcast([{ value: fullValue, meta }]);

        return { value: fullValue, meta };
      }
    }).pipe(
      Effect.withSpan('sqlite.entity.get-and-update', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * Deletes an entity (soft delete).
   * Updates the item with _d: true and a new _u so sync can pick up the change.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The deleted entity
   */
  delete(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SqliteDBError.noItemToDelete((yield* SqliteDB).tableName),
        );
      }

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

      // Generate new _u and encode with _d: true for soft delete
      const { encoded, meta } = yield* this.#encode(existing.value, true);

      // Update the item with _d: true and new _u (soft delete)
      const updateValues: Record<string, unknown> = {
        _data: JSON.stringify(encoded),
        _v: meta._v,
        _u: meta._u,
        _d: 1,
        ...this.#deriveSecondaryIndexes({ ...existing.value, _u: meta._u }),
      };

      yield* this.#table.updateItem({ pk, sk }, updateValues);

      const deletedEntity = {
        value: existing.value,
        meta,
      };

      yield* this.#broadcast([deletedEntity]);

      return deletedEntity;
    }).pipe(
      Effect.withSpan('sqlite.entity.delete', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * Restores a soft-deleted entity with a fresh `_u` so sync consumers see it
   * become live again.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The restored entity
   */
  restore(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SqliteDBError.noItemToRestore((yield* SqliteDB).tableName),
        );
      }

      if (!existing.meta._d) return existing;

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

      const { encoded, meta } = yield* this.#encode(existing.value, false);

      const updateValues: Record<string, unknown> = {
        _data: JSON.stringify(encoded),
        _v: meta._v,
        _u: meta._u,
        _d: 0,
        ...this.#deriveSecondaryIndexes({ ...existing.value, _u: meta._u }),
      };

      const db = yield* SqliteDB;
      const where = Sql.whereAnd(
        Sql.wherePkSkExact(
          this.#table.primary.pk,
          this.#table.primary.sk,
          pk,
          sk,
        ),
        Sql.where('_u', '=', existing.meta._u),
      );
      const { rowsWritten } = yield* db.update(
        db.tableName,
        updateValues,
        where,
      );
      if (rowsWritten === 0) {
        return yield* Effect.fail(
          SqliteDBError.conditionFailed(db.tableName, { pk, sk }),
        );
      }

      const restoredEntity = { value: existing.value, meta };
      yield* this.#broadcast([restoredEntity]);
      return restoredEntity;
    }).pipe(
      Effect.withSpan('sqlite.entity.restore', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * Hard-deletes this entity's rows from the shared table.
   *
   * @param where - Optional additional row filter
   */
  hardDelete(
    where: Sql.Where = Sql.whereNone,
  ): Effect.Effect<{ rowsDeleted: number }, SqliteDBError, SqliteDB> {
    return this.#table.delete(
      Sql.whereAnd(Sql.where('_e', '=', this.#eschema.name), where),
    );
  }

  /**
   * Queries entities using the primary index or a secondary index.
   *
   * @param key - "primary" for primary index, or the secondary index name
   * @param params - Query parameters with pk and sk
   * @param options - Query options including limit
   * @returns Array of matching entities with metadata
   */
  query<K extends 'primary' | keyof TSecondaryDerivationMap>(
    key: K,
    params: K extends 'primary'
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: SkParam }
        : {
            pk: Prettify<IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>>;
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
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen({ self: this }, function* () {
      const { operator, value: skValue } = extractKeyOp(params.sk as SkParam);
      const scanForward = getKeyOpScanDirection(operator);

      if (key === 'primary') {
        // Primary index query
        const derivedPk = deriveIndexKeyValue(
          this.#eschema.name,
          this.#primaryDerivation.pkDeps,
          (params.pk ?? {}) as Record<string, unknown>,
          true,
        );

        const skCondition: SortKeyCondition | undefined =
          skValue !== null
            ? ({ [operator]: skValue } as SortKeyCondition)
            : undefined;

        const queryParams = skCondition
          ? { pk: derivedPk, sk: skCondition }
          : { pk: derivedPk };

        const queryOptions: { Limit?: number; ScanIndexForward?: boolean } = {
          ScanIndexForward: scanForward,
        };
        if (options?.limit !== undefined) {
          queryOptions.Limit = options.limit;
        }

        const { Items } = yield* this.#table.query(queryParams, queryOptions);

        const items = yield* this.#decodeItems(Items);
        return { items };
      } else {
        // Secondary index query
        const indexDerivation = this.#secondaryDerivations[key];

        if (!indexDerivation) {
          return yield* Effect.fail(
            SqliteDBError.queryFailed(
              (yield* SqliteDB).tableName,
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

        const resolvedSkValue = this.#resolveCustomSk(skValue, indexDerivation);

        const skConditionSecondary: SortKeyCondition | undefined =
          resolvedSkValue !== null
            ? ({ [operator]: resolvedSkValue } as SortKeyCondition)
            : undefined;

        const secondaryQueryParams = skConditionSecondary
          ? { pk: derivedPk, sk: skConditionSecondary }
          : { pk: derivedPk };

        const secondaryQueryOptions: {
          Limit?: number;
          ScanIndexForward?: boolean;
        } = {
          ScanIndexForward: scanForward,
        };
        if (options?.limit !== undefined) {
          secondaryQueryOptions.Limit = options.limit;
        }

        const { Items } = yield* this.#table
          .index(indexDerivation.indexName as any)
          .query(secondaryQueryParams, secondaryQueryOptions);

        const items = yield* this.#decodeItems(Items);
        return { items };
      }
    }).pipe(
      Effect.withSpan('sqlite.entity.query', {
        attributes: {
          entity: this.#eschema.name,
          index: String(key),
        },
      }),
    );
  }

  /**
   * Streams all entities from an index until exhaustion.
   * Uses cursor-based pagination to iterate through all items.
   *
   * @param key - "primary" for primary index, or the secondary index name
   * @param params - Query parameters with pk and sk (only > and < operators supported)
   * @param options - Stream options including batchSize
   * @returns A Stream that yields batches of entities
   */
  queryStream<K extends 'primary' | keyof TSecondaryDerivationMap>(
    key: K,
    params: K extends 'primary'
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: StreamSkParam }
        : {
            pk: Prettify<IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>>;
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
    SqliteDBError,
    SqliteDB
  > {
    const batchSize = options?.batchSize ?? 100;
    const operator = '>' in params.sk ? '>' : '<';
    const initialSkValue = '>' in params.sk ? params.sk['>'] : params.sk['<'];

    const indexDerivation =
      key !== 'primary' ? this.#secondaryDerivations[key] : undefined;
    const isCustomSk = indexDerivation && !indexDerivation.isTimelineSk;

    const initialCursor: string | null = isCustomSk
      ? this.#resolveCustomSk(initialSkValue, indexDerivation!)
      : (initialSkValue as string | null);

    return Stream.paginate(initialCursor, (cursor: string | null) =>
      Effect.gen({ self: this }, function* () {
        const result = yield* this.query(
          key,
          { pk: params.pk, sk: { [operator]: cursor } as SkParam } as any,
          { limit: batchSize },
        );
        const items = result.items;

        if (items.length === 0 || items.length < batchSize) {
          return [[items], Option.none<string | null>()] as const;
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
        return [[items], Option.some(nextCursor)] as const;
      }),
    ).pipe(
      Stream.withSpan('sqlite.entity.query-stream', {
        attributes: {
          entity: this.#eschema.name,
          index: String(key),
          batchSize,
        },
      }),
    );
  }

  /**
   * Validates, encodes and derives stable keys NOW (no write), returning a
   * descriptor for the table's `transact`. The final cursor and cursor-derived
   * indexes are assigned when applied. Applying the op fails with
   * `conditionFailed` if the row already exists.
   *
   * @param value - The entity value to insert
   * @returns A descriptor for insert, plus its broadcast payload
   */
  insertOp(
    value: InsertInput<ESchemaType<TSchema>>,
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const { item, meta: preparedMeta } =
        yield* this.#prepareInsert(fullValue);

      return {
        entityName: this.#eschema.name,
        operationKind: 'insertOp',
        pk: item.pk as string,
        sk: item.sk as string,
        table: this.#table,
        apply: (u) => {
          const valueWithMeta = { ...fullValue, _u: u };
          const primaryIndex = this.#derivePrimaryIndex(valueWithMeta);
          return {
            write: {
              type: 'insert',
              key: { pk: primaryIndex.pk, sk: primaryIndex.sk },
              values: {
                ...item,
                pk: primaryIndex.pk,
                sk: primaryIndex.sk,
                _u: u,
                ...this.#deriveSecondaryIndexes(valueWithMeta),
              },
            } satisfies SqliteWriteOp,
            entity: { value: fullValue, meta: { ...preparedMeta, _u: u } },
          };
        },
      };
    });
  }

  /**
   * Validates, encodes and derives keys NOW (no write), pre-fetching the
   * existing entity so the returned op embeds the optimistic `expectedU`
   * check and complete broadcast data.
   *
   * @param keyValue - Object containing the primary key field values
   * @param update - Partial entity, or a callback deriving one from the current value
   * @returns A descriptor for update, plus its broadcast payload
   */
  getAndUpdateOp(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    update: UpdateOpInput<ESchemaType<TSchema>>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SqliteDBError.noItemToUpdate((yield* SqliteDB).tableName),
        );
      }

      const fullValue = {
        ...existing.value,
        ...(typeof update === 'function' ? update(existing.value) : update),
      } as ESchemaType<TSchema>;

      return yield* this.#buildWriteOp(
        keyValue as Record<string, unknown>,
        fullValue,
        existing.meta._d,
        options?.lastWriteWins ? undefined : existing.meta._u,
      );
    });
  }

  deleteOp(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SqliteDBError.noItemToDelete((yield* SqliteDB).tableName),
        );
      }

      return yield* this.#buildWriteOp(
        keyValue as Record<string, unknown>,
        existing.value,
        true,
        options?.lastWriteWins ? undefined : existing.meta._u,
        'deleteOp',
      );
    });
  }

  restoreOp(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SqliteDBError.noItemToRestore((yield* SqliteDB).tableName),
        );
      }

      return yield* this.#buildWriteOp(
        keyValue as Record<string, unknown>,
        existing.value,
        false,
        options?.lastWriteWins ? undefined : existing.meta._u,
        'restoreOp',
      );
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  #buildWriteOp(
    keyValue: Record<string, unknown>,
    fullValue: ESchemaType<TSchema>,
    deleted: boolean,
    expectedU: string | undefined,
    operationKind: SqliteEntityOp['operationKind'] = 'updateOp',
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const { encoded, meta: encodedMeta } = yield* this.#encode(
        fullValue,
        deleted,
      );

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

      return {
        entityName: this.#eschema.name,
        operationKind,
        pk,
        sk,
        table: this.#table,
        apply: (u) => ({
          write: {
            type: 'update',
            key: { pk, sk },
            values: {
              _data: JSON.stringify(encoded),
              _v: encodedMeta._v,
              _u: u,
              _d: deleted ? 1 : 0,
              ...this.#deriveSecondaryIndexes({ ...fullValue, _u: u }),
            },
            ...(expectedU !== undefined && { expectedU }),
          } satisfies SqliteWriteOp,
          entity: { value: fullValue, meta: { ...encodedMeta, _u: u } },
        }),
      };
    });
  }

  #broadcast(entities: EntityType<ESchemaType<TSchema>>[]) {
    return Effect.gen(function* () {
      const service = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );
      service?.broadcast(entities);
    });
  }

  #prepareInsert(
    fullValue: ESchemaType<TSchema>,
  ): Effect.Effect<
    { item: Record<string, unknown>; meta: RowMeta },
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen({ self: this }, function* () {
      const { encoded, meta } = yield* this.#encode(fullValue, false);

      const valueWithMeta = { ...fullValue, _u: meta._u };
      const primaryIndex = this.#derivePrimaryIndex(valueWithMeta);
      const secondaryIndexes = this.#deriveSecondaryIndexes(valueWithMeta);

      const item: Record<string, unknown> = {
        pk: primaryIndex.pk,
        sk: primaryIndex.sk,
        _data: JSON.stringify(encoded),
        _e: this.#eschema.name,
        _v: meta._v,
        _u: meta._u,
        _d: 0,
        ...secondaryIndexes,
      };

      return { item, meta };
    });
  }

  #encode(
    value: ESchemaType<TSchema>,
    deleted: boolean,
  ): Effect.Effect<
    { encoded: Record<string, unknown>; meta: RowMeta },
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen({ self: this }, function* () {
      const db = yield* SqliteDB;
      const encoded = yield* this.#eschema
        .encode(value as Record<string, unknown>)
        .pipe(
          Effect.mapError((e) => SqliteDBError.insertFailed(db.tableName, e)),
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

  #parseRow(
    row: RawRow,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError, SqliteDB> {
    return Effect.flatMap(SqliteDB, (db) =>
      this.#eschema
        .decode({ ...JSON.parse(row._data), _v: row._v })
        .pipe(
          Effect.mapError((e) => SqliteDBError.queryFailed(db.tableName, e)),
        ),
    ).pipe(
      Effect.map((value) => ({
        value: value as ESchemaType<TSchema>,
        meta: Schema.decodeSync(sqlMetaSchema)({
          _v: row._v,
          _u: row._u,
          _d: row._d,
          _e: row._e ?? this.#eschema.name,
        }),
      })),
    );
  }

  #decodeItems(
    items: RawRow[],
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>>[],
    SqliteDBError,
    SqliteDB
  > {
    return Effect.all(items.map((item) => this.#parseRow(item)));
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

  #derivePrimaryIndex(value: Record<string, unknown>): {
    pk: string;
    sk: string;
  } {
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

  #deriveSecondaryIndexes(
    value: Record<string, unknown>,
  ): Record<string, string> {
    const indexMap: Record<string, string> = {};

    for (const [, derivation] of Object.entries(this.#secondaryDerivations)) {
      const deriv = derivation as StoredIndexDerivation;

      if (
        deriv.pkDeps.every((key: string) => typeof value[key] !== 'undefined')
      ) {
        const pkCol = this.#table.secondaryIndexMap[deriv.indexName]?.pk;
        if (pkCol) {
          indexMap[pkCol] = deriveIndexKeyValue(
            `${this.#eschema.name}#${deriv.entityIndexName}`,
            deriv.pkDeps,
            value,
            true,
          );
        }
      }

      if (
        deriv.skDeps.every((key: string) => typeof value[key] !== 'undefined')
      ) {
        const skCol = this.#table.secondaryIndexMap[deriv.indexName]?.sk;
        if (skCol) {
          indexMap[skCol] = deriveIndexKeyValue(
            this.#eschema.name,
            deriv.skDeps,
            value,
            false,
          );
        }
      }
    }

    return indexMap;
  }
}

/**
 * Builder class for configuring entity index derivations.
 */
export class EntityIndexDerivations<
  TTable extends SQLiteTableInstance,
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
  #onBuild: ((entity: SQLiteEntity<any, any, any>) => void) | undefined;

  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: {
      pk: readonly (keyof ESchemaType<TSchema>)[];
      sk: readonly (keyof ESchemaType<TSchema>)[];
    },
    definitions: TSecondaryDerivationMap,
    onBuild?: (entity: SQLiteEntity<any, any, any>) => void,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = definitions;
    this.#onBuild = onBuild;
  }

  /**
   * Maps a table index to a semantic entity index with custom derivation.
   * SK defaults to `_u` if not specified.
   *
   * @typeParam IndexName - The index name on the table
   * @typeParam TPkKeys - Fields used for partition key derivation
   * @typeParam TSkKeys - Fields used for sort key derivation (defaults to ["_u"])
   * @param indexName - The index name on the table (e.g., "IDX1")
   * @param entityIndexName - The semantic name for this entity's use of the index (e.g., "byEmail")
   * @param derivation - The pk and optional sk field arrays
   * @returns A builder with the index mapping added
   */
  index<
    IndexNameStr extends keyof TTable['secondaryIndexMap'] & string,
    EntityIndexName extends string,
    const TPkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[],
    const TSkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[] = readonly ['_u'],
  >(
    indexName: IndexNameStr,
    entityIndexName: EntityIndexName,
    derivation: {
      pk: TPkKeys;
      sk?: TSkKeys;
    },
  ) {
    const skKeys = (derivation.sk ?? ['_u']) as TSkKeys;
    const isTimelineSk = skKeys.length === 1 && skKeys[0] === '_u';
    const newDeriv: StoredIndexDerivation = {
      indexName,
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
          EntityIndexName,
          StoredIndexDerivation & {
            pkDeps: TPkKeys;
            skDeps: TSkKeys;
            isTimelineSk: IsTimelineSk<TSkKeys>;
          }
        >
    >;
  }

  /**
   * Builds the final SQLiteEntity instance.
   *
   * @returns The configured SQLiteEntity
   */
  build() {
    const storedPrimary: StoredPrimaryDerivation = {
      pkDeps: this.#primaryDerivation.pk.map(String),
      skDeps: this.#primaryDerivation.sk.map(String),
    };

    const entity = new SQLiteEntity<
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >(this.#table, this.#eschema, storedPrimary, this.#secondaryDerivations);
    this.#onBuild?.(entity);
    return entity;
  }
}
