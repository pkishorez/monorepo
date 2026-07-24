import type {
  AnyEntityESchema,
  ESchemaType,
  Prettify,
} from '../../../eschema/index.js';
import { Effect, Option, Schema, Stream } from 'effect';
import type { EntityType } from '../../../core/index.js';
import { Broadcaster, MetaSchema, nextUlid } from '../../../core/index.js';
import type { IdbTableInstance, SortKeyCondition } from './idb-table.js';
import { IdbDB, IdbDBError } from './db.js';
import type { IdbRecord, IdbWriteOp } from './db.js';
import {
  deriveIndexKeyValue,
  extractKeyOp,
  getKeyOpScanDirection,
  type SkParam,
  type StreamSkParam,
  type CustomSkParam,
  type CustomStreamSkParam,
  type SimpleQueryOptions,
  type QueryStreamOptions,
  type StoredIndexDerivation,
  type StoredPrimaryDerivation,
} from './internal/utils.js';

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
 * A deferred write produced by `insertOp`/`getAndUpdateOp`, consumed by the table's
 * `transact`. `apply` is pure — the transaction supplies the write cursor and
 * gets back the concrete write plus the broadcast payload, flushed only after
 * the underlying native transaction commits. `table` identifies where the op
 * was built so `transact` can reject foreign ops.
 */
export interface IdbEntityOp<T = unknown> {
  readonly entityName: string;
  readonly operationKind: 'insertOp' | 'updateOp' | 'deleteOp' | 'restoreOp';
  readonly pk: string;
  readonly sk: string;
  readonly table: unknown;
  readonly apply: (u: string) => {
    write: IdbWriteOp;
    entity: EntityType<T>;
  };
}

/**
 * An IndexedDB entity with type-safe CRUD operations and automatic index
 * derivation. Entities are built on top of an `IdbTable` and use an ESchema
 * for validation. Mirrors `SQLiteEntity`'s surface; see
 * `src/db/idb/CONTEXT.md` and the buffered-transaction ADR for why writes
 * go through `IdbDB.transact` with an `expectedU` optimistic check instead
 * of an interactive begin/commit.
 */
export class IdbEntity<
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
> {
  /**
   * Creates a new entity builder for the given table.
   *
   * @typeParam TTable - The IdbTable instance type
   * @param table - The IdbTable instance
   * @returns A builder to configure the entity schema
   */
  static make<TTable extends IdbTableInstance>(
    table: TTable,
    onBuild?: (entity: IdbEntity<any, any, any>) => void,
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

  #table: IdbTableInstance;
  #eschema: TSchema;
  #primaryDerivation: StoredPrimaryDerivation;
  #secondaryDerivations: TSecondaryDerivationMap;

  constructor(
    table: IdbTableInstance,
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
  ): Effect.Effect<EntityType<ESchemaType<TSchema>> | null, IdbDBError, IdbDB> {
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
      Effect.withSpan('idb.entity.get', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * Inserts a new entity. Fails with `conditionFailed` if the primary key
   * already exists (the IDB analog of SQLite's PK-conflict `insertFailed`).
   *
   * @param value - The entity value to insert
   * @returns The inserted entity with metadata
   */
  insert(
    value: InsertInput<ESchemaType<TSchema>>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const op = yield* this.#buildInsertOp(value);
      const { write, entity } = op.apply(yield* nextUlid);
      const db = yield* IdbDB;
      yield* db.transact([write]);
      yield* this.#broadcast([entity]);
      return entity;
    }).pipe(
      Effect.withSpan('idb.entity.insert', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * The portable read-modify-write: reads the current entity (auto-migrating
   * on decode), derives a partial from it, and writes the full merged record
   * back with `expectedU` set to the `_u` that was read. On a concurrent-write
   * conflict, re-reads and re-runs up to `retries` times (default 3) before
   * failing with `conditionFailed`. A callback returning `null` skips the
   * write and resolves with the current entity. `lastWriteWins: true` drops
   * the guard.
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
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const retries = config?.retries ?? 3;
      for (let attempt = 0; ; attempt++) {
        const existing = yield* this.get(keyValue);
        if (!existing) {
          const db = yield* IdbDB;
          return yield* Effect.fail(IdbDBError.noItemToUpdate(db.tableName));
        }

        const partial =
          typeof update === 'function' ? update(existing.value) : update;
        if (partial === null) return existing;

        const fullValue = {
          ...existing.value,
          ...partial,
        } as ESchemaType<TSchema>;

        const { record, meta } = yield* this.#encodeForWrite(
          fullValue,
          existing.meta._d,
          keyValue as Record<string, unknown>,
        );

        const db = yield* IdbDB;
        const conflicted = yield* db
          .transact([
            {
              type: 'put',
              record,
              ...(config?.lastWriteWins ? {} : { expectedU: existing.meta._u }),
            },
          ])
          .pipe(
            Effect.as(false),
            Effect.catchIf(
              (e) => e.code === 'conditionFailed',
              () => Effect.succeed(true),
            ),
          );
        if (conflicted) {
          if (attempt < retries) continue;
          return yield* Effect.fail(
            IdbDBError.conditionFailed(db.tableName, {
              pk: record.pk,
              sk: record.sk,
            }),
          );
        }

        const entity = { value: fullValue, meta };
        yield* this.#broadcast([entity]);
        return entity;
      }
    }).pipe(
      Effect.withSpan('idb.entity.get-and-update', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * Deletes an entity (soft delete). Re-encodes the existing value with a
   * fresh `_u` and `_d: true` so sync can pick up the tombstone; the record
   * stays readable via `get`.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The deleted entity
   */
  delete(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        const db = yield* IdbDB;
        return yield* Effect.fail(IdbDBError.noItemToDelete(db.tableName));
      }

      const { record, meta } = yield* this.#encodeForWrite(
        existing.value,
        true,
        keyValue as Record<string, unknown>,
      );

      const db = yield* IdbDB;
      yield* db.transact([
        { type: 'put', record, expectedU: existing.meta._u },
      ]);

      const deletedEntity = { value: existing.value, meta };
      yield* this.#broadcast([deletedEntity]);

      return deletedEntity;
    }).pipe(
      Effect.withSpan('idb.entity.delete', {
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
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        const db = yield* IdbDB;
        return yield* Effect.fail(IdbDBError.noItemToRestore(db.tableName));
      }

      if (!existing.meta._d) return existing;

      const { record, meta } = yield* this.#encodeForWrite(
        existing.value,
        false,
        keyValue as Record<string, unknown>,
      );

      const db = yield* IdbDB;
      yield* db.transact([
        { type: 'put', record, expectedU: existing.meta._u },
      ]);

      const restoredEntity = { value: existing.value, meta };
      yield* this.#broadcast([restoredEntity]);
      return restoredEntity;
    }).pipe(
      Effect.withSpan('idb.entity.restore', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * Hard-deletes a single entity by its primary key, physically removing the
   * row from the shared store.
   *
   * Unlike SQLite (which can bulk-delete every row for an entity via a plain
   * SQL `WHERE`), IndexedDB has no primitive to scan across every partition
   * key an entity's rows might live under, so this operates on one key at a
   * time — mirroring `IdbTable.hardDeleteItem` and DynamoDB's single-key
   * `forceDelete`.
   *
   * ⚠️ Hard delete is **not safe for sync engines**: consumers relying on the
   * soft-delete tombstone (`_d: true`) to propagate deletions will never see
   * this row disappear. Prefer `delete` unless you are certain no sync
   * consumer depends on this row.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The entity as it was immediately before removal
   */
  hardDelete(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        const db = yield* IdbDB;
        return yield* Effect.fail(IdbDBError.noItemToDelete(db.tableName));
      }

      const { pk, sk } = this.#derivePrimaryIndex(
        keyValue as Record<string, unknown>,
      );

      yield* this.#table.hardDeleteItem({ pk, sk });

      return existing;
    }).pipe(
      Effect.withSpan('idb.entity.hard-delete', {
        attributes: { entity: this.#eschema.name },
      }),
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
    IdbDBError,
    IdbDB
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
            IdbDBError.queryFailed(
              (yield* IdbDB).tableName,
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
      Effect.withSpan('idb.entity.query', {
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
  ): Stream.Stream<EntityType<ESchemaType<TSchema>>[], IdbDBError, IdbDB> {
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
      Stream.withSpan('idb.entity.query-stream', {
        attributes: {
          entity: this.#eschema.name,
          index: String(key),
          batchSize,
        },
      }),
    );
  }

  /**
   * Validates, encodes and derives keys NOW (no write), returning a pure
   * descriptor for `EntityRegistry.transact`. The `expectedU: null` write op
   * makes a duplicate insert fail with `conditionFailed`, same as `insert`.
   *
   * @param value - The entity value to insert
   * @returns A descriptor for insert, plus its broadcast payload
   */
  insertOp(
    value: InsertInput<ESchemaType<TSchema>>,
  ): Effect.Effect<IdbEntityOp<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return this.#buildInsertOp(value);
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
  ): Effect.Effect<IdbEntityOp<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return this.#buildUpdateOp(keyValue, update, options);
  }

  deleteOp(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<IdbEntityOp<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return this.#buildTombstoneOp(keyValue, true, options);
  }

  restoreOp(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<IdbEntityOp<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return this.#buildTombstoneOp(keyValue, false, options);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  #broadcast(entities: EntityType<ESchemaType<TSchema>>[]) {
    return Effect.gen(function* () {
      const service = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );
      service?.broadcast(entities);
    });
  }

  #buildInsertOp(
    value: InsertInput<ESchemaType<TSchema>>,
  ): Effect.Effect<IdbEntityOp<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const { record, meta: preparedMeta } = yield* this.#encodeForWrite(
        fullValue,
        false,
        fullValue as Record<string, unknown>,
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
                ...this.#derivePrimaryIndex(valueWithMeta),
                _u: u,
                ...this.#deriveSecondaryIndexes(valueWithMeta),
              },
              expectedU: null,
            } satisfies IdbWriteOp,
            entity: { value: fullValue, meta: { ...preparedMeta, _u: u } },
          };
        },
      };
    });
  }

  #buildUpdateOp(
    keyValue: Record<string, unknown>,
    update: UpdateOpInput<ESchemaType<TSchema>>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<IdbEntityOp<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(
        keyValue as IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
          Pick<ESchemaType<TSchema>, TSchema['idField']>,
      );
      if (!existing) {
        const db = yield* IdbDB;
        return yield* Effect.fail(IdbDBError.noItemToUpdate(db.tableName));
      }

      const fullValue = {
        ...existing.value,
        ...(typeof update === 'function' ? update(existing.value) : update),
      } as ESchemaType<TSchema>;

      const { record, meta: preparedMeta } = yield* this.#encodeForWrite(
        fullValue,
        existing.meta._d,
        keyValue,
      );

      return {
        entityName: this.#eschema.name,
        operationKind: 'updateOp',
        pk: record.pk,
        sk: record.sk,
        table: this.#table,
        apply: (u) => ({
          write: {
            type: 'put',
            record: {
              ...record,
              _u: u,
              ...this.#deriveSecondaryIndexes({ ...fullValue, _u: u }),
            },
            ...(options?.lastWriteWins ? {} : { expectedU: existing.meta._u }),
          } satisfies IdbWriteOp,
          entity: { value: fullValue, meta: { ...preparedMeta, _u: u } },
        }),
      };
    });
  }

  #buildTombstoneOp(
    keyValue: Record<string, unknown>,
    deleted: boolean,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<IdbEntityOp<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get(
        keyValue as IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
          Pick<ESchemaType<TSchema>, TSchema['idField']>,
      );
      if (!existing) {
        const db = yield* IdbDB;
        return yield* Effect.fail(
          deleted
            ? IdbDBError.noItemToDelete(db.tableName)
            : IdbDBError.noItemToRestore(db.tableName),
        );
      }

      const { record, meta: preparedMeta } = yield* this.#encodeForWrite(
        existing.value,
        deleted,
        keyValue,
      );

      return {
        entityName: this.#eschema.name,
        operationKind: deleted ? 'deleteOp' : 'restoreOp',
        pk: record.pk,
        sk: record.sk,
        table: this.#table,
        apply: (u) => ({
          write: {
            type: 'put',
            record: {
              ...record,
              _u: u,
              ...this.#deriveSecondaryIndexes({ ...existing.value, _u: u }),
            },
            ...(options?.lastWriteWins ? {} : { expectedU: existing.meta._u }),
          } satisfies IdbWriteOp,
          entity: {
            value: existing.value,
            meta: { ...preparedMeta, _u: u },
          },
        }),
      };
    });
  }

  #encode(
    value: ESchemaType<TSchema>,
    deleted: boolean,
  ): Effect.Effect<
    {
      encoded: Record<string, unknown>;
      meta: EntityType<ESchemaType<TSchema>>['meta'];
    },
    IdbDBError,
    IdbDB
  > {
    return Effect.gen({ self: this }, function* () {
      const db = yield* IdbDB;
      const encoded = yield* this.#eschema
        .encode(value as Record<string, unknown>)
        .pipe(Effect.mapError((e) => IdbDBError.putFailed(db.tableName, e)));

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

  /**
   * Encodes `value`, derives the primary key from `keyValue` and every
   * secondary index from `value`, and assembles the full `IdbRecord` to
   * `put`. Unlike SQLite's column-level `UPDATE`, a `put` replaces the whole
   * row, so this is shared by insert/update/delete — there is no partial
   * patch path that could leave a stale secondary-index field behind.
   */
  #encodeForWrite(
    fullValue: ESchemaType<TSchema>,
    deleted: boolean,
    keyValue: Record<string, unknown>,
  ): Effect.Effect<
    { record: IdbRecord; meta: EntityType<ESchemaType<TSchema>>['meta'] },
    IdbDBError,
    IdbDB
  > {
    return Effect.gen({ self: this }, function* () {
      const { encoded, meta } = yield* this.#encode(fullValue, deleted);

      const { pk, sk } = this.#derivePrimaryIndex(keyValue);
      const valueWithMeta = { ...fullValue, _u: meta._u };
      const secondaryIndexes = this.#deriveSecondaryIndexes(valueWithMeta);

      const record: IdbRecord = {
        pk,
        sk,
        _data: encoded,
        _e: this.#eschema.name,
        _v: meta._v,
        _u: meta._u,
        _d: deleted,
        ...secondaryIndexes,
      };

      return { record, meta };
    });
  }

  #parseRow(
    row: IdbRecord,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.flatMap(IdbDB, (db) =>
      this.#eschema
        .decode({ ...row._data, _v: row._v })
        .pipe(Effect.mapError((e) => IdbDBError.getFailed(db.tableName, e))),
    ).pipe(
      Effect.map((value) => ({
        value: value as ESchemaType<TSchema>,
        meta: Schema.decodeSync(MetaSchema)({
          _v: row._v,
          _u: row._u,
          _d: row._d,
          _e: row._e ?? this.#eschema.name,
        }),
      })),
    );
  }

  #decodeItems(
    items: IdbRecord[],
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>[], IdbDBError, IdbDB> {
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
  TTable extends IdbTableInstance,
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
  #onBuild: ((entity: IdbEntity<any, any, any>) => void) | undefined;

  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: {
      pk: readonly (keyof ESchemaType<TSchema>)[];
      sk: readonly (keyof ESchemaType<TSchema>)[];
    },
    definitions: TSecondaryDerivationMap,
    onBuild?: (entity: IdbEntity<any, any, any>) => void,
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
   * Builds the final IdbEntity instance.
   *
   * @returns The configured IdbEntity
   */
  build() {
    const storedPrimary: StoredPrimaryDerivation = {
      pkDeps: this.#primaryDerivation.pk.map(String),
      skDeps: this.#primaryDerivation.sk.map(String),
    };

    const entity = new IdbEntity<
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >(this.#table, this.#eschema, storedPrimary, this.#secondaryDerivations);
    this.#onBuild?.(entity);
    return entity;
  }
}
