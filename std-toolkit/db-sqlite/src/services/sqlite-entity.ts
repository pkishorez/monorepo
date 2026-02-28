import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Chunk, Effect, FiberRef, Option, Schema, Stream } from "effect";
import type { SQLiteTableInstance, SortKeyCondition } from "./sqlite-table.js";
import {
  SqliteDB,
  SqliteDBError,
  TransactionPendingBroadcasts,
} from "../sql/db.js";
import {
  deriveIndexKeyValue,
  extractKeyOp,
  getKeyOpScanDirection,
  sqlMetaSchema,
  type RawRow,
  type RowMeta,
  type SkParam,
  type StreamSkParam,
  type SimpleQueryOptions,
  type QueryStreamOptions,
  type SubscribeOptions,
  type StoredIndexDerivation,
  type StoredPrimaryDerivation,
  type StoredTimelineDerivation,
} from "../internal/utils.js";
import type { StdDescriptor, IndexPatternDescriptor } from "@std-toolkit/core";
import { ConnectionService } from "@std-toolkit/core/server";
import { Prettify } from "@std-toolkit/eschema/types.js";

/**
 * Meta fields that can be used in index derivations.
 */
type DerivableMetaFields = "_uid";

/**
 * Input type for insert operations. Omits the internal `_v` field.
 */
type InsertInput<T, IdField extends string> = Omit<T, "_v">;

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
  TSchema extends AnyESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
  TTimelineDerivation extends StoredTimelineDerivation | null = null,
> {
  /**
   * Creates a new entity builder for the given table.
   *
   * @typeParam TTable - The SQLiteTable instance type
   * @param table - The SQLiteTable instance
   * @returns A builder to configure the entity schema
   */
  static make<TTable extends SQLiteTableInstance>(table: TTable) {
    return {
      /**
       * Configures the entity to use the given ESchema.
       *
       * @typeParam TS - The ESchema type
       * @param eschema - The ESchema instance
       * @returns A builder to configure the primary index derivation
       */
      eschema<TS extends AnyESchema>(eschema: TS) {
        return {
          /**
           * Defines the primary index derivation fields.
           * SK is automatically set to the ESchema's idField.
           *
           * @param primaryDerivation - Optional pk field array. If not provided, uses entity name only.
           * @returns A builder to add secondary index mappings
           */
          primary<
            const TPkKeys extends readonly (
              | keyof ESchemaType<TS>
              | DerivableMetaFields
            )[] = [],
          >(primaryDerivation?: { pk: TPkKeys }) {
            const pkKeys = primaryDerivation?.pk ?? ([] as unknown as TPkKeys);
            // SK is always the idField from the ESchema
            const skKeys = [eschema.idField] as const;
            return new EntityIndexDerivations<
              TTable,
              TS,
              ExtractKeys<ESchemaType<TS>, TPkKeys>,
              {},
              null
            >(table, eschema, { pk: pkKeys, sk: skKeys } as any, {}, null);
          },
        };
      },
    };
  }

  #table: SQLiteTableInstance;
  #eschema: TSchema;
  #primaryDerivation: StoredPrimaryDerivation;
  #secondaryDerivations: TSecondaryDerivationMap;
  #timelineDerivation: TTimelineDerivation;

  constructor(
    table: SQLiteTableInstance,
    eschema: TSchema,
    primaryDerivation: StoredPrimaryDerivation,
    secondaryDerivations: TSecondaryDerivationMap,
    timelineDerivation: TTimelineDerivation,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = secondaryDerivations;
    this.#timelineDerivation = timelineDerivation;
  }

  /**
   * Gets the entity name from the schema.
   */
  get name(): TSchema["name"] {
    return this.#eschema.name;
  }

  /**
   * Gets the ID field name from the schema.
   */
  get idField(): TSchema["idField"] {
    return this.#eschema.idField;
  }

  /**
   * Gets the unified descriptor for this entity including schema and index info.
   */
  getDescriptor(): StdDescriptor {
    const entityName = this.#eschema.name;
    return {
      name: entityName,
      idField: this.#eschema.idField,
      version: this.#eschema.latestVersion,
      primaryIndex: {
        name: "primary",
        pk: this.#extractIndexPattern(
          this.#primaryDerivation.pkDeps,
          entityName,
          true,
        ),
        sk: this.#extractIndexPattern(
          this.#primaryDerivation.skDeps,
          entityName,
          false,
        ),
      },
      ...(this.#timelineDerivation
        ? {
            timelineIndex: {
              name: "timeline",
              pk: this.#extractIndexPattern(
                this.#timelineDerivation.pkDeps,
                entityName,
                true,
              ),
              sk: this.#extractIndexPattern(
                this.#timelineDerivation.skDeps as unknown as string[],
                entityName,
                false,
              ),
            },
          }
        : {}),
      secondaryIndexes: Object.entries(this.#secondaryDerivations).map(
        ([, deriv]) => ({
          name: deriv.entityIndexName,
          pk: this.#extractIndexPattern(
            deriv.pkDeps,
            deriv.entityIndexName,
            true,
          ),
          sk: this.#extractIndexPattern(deriv.skDeps, entityName, false),
        }),
      ),
      schema: this.#eschema.getDescriptor(),
    };
  }

  /**
   * Retrieves an entity by its primary key fields.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The entity if found, or null
   */
  get(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema["idField"]>,
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>> | null,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen(this, function* () {
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
    });
  }

  /**
   * Inserts a new entity.
   *
   * @param value - The entity value to insert
   * @returns The inserted entity with metadata
   */
  insert(
    value: InsertInput<ESchemaType<TSchema>, TSchema["idField"]>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const { item, meta } = yield* this.#prepareInsert(fullValue);

      yield* this.#table.putItem(item);

      yield* this.#broadcast({ value: fullValue, meta });

      return { value: fullValue, meta };
    });
  }

  /**
   * Updates an existing entity by its primary key.
   *
   * @param keyValue - Object containing the primary key field values
   * @param updates - Partial entity with fields to update
   * @returns The updated entity with new metadata
   */
  update(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema["idField"]>,
    updates: Partial<Omit<ESchemaType<TSchema>, "_v">>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      // Get existing item
      const existing = yield* this.get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SqliteDBError.updateFailed(this.#table.tableName, "Item not found"),
        );
      }

      // Merge updates
      const fullValue = {
        ...existing.value,
        ...updates,
      } as ESchemaType<TSchema>;

      const { encoded, meta } = yield* this.#encode(
        fullValue,
        existing.meta._d,
      );

      // Compute primary keys
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

      // Update the item
      const updateValues: Record<string, unknown> = {
        _data: JSON.stringify(encoded),
        _v: meta._v,
        _uid: meta._uid,
        ...this.#deriveSecondaryIndexes({ ...fullValue, _uid: meta._uid }),
      };

      yield* this.#table.updateItem({ pk, sk }, updateValues);

      yield* this.#broadcast({ value: fullValue, meta });

      return { value: fullValue, meta };
    });
  }

  /**
   * Deletes an entity (soft delete).
   * Updates the item with _d: true and a new _uid so sync can pick up the change.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The deleted entity
   */
  delete(
    keyValue: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema["idField"]>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        return yield* Effect.fail(
          SqliteDBError.deleteFailed(this.#table.tableName, "Item not found"),
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

      // Generate new _uid and encode with _d: true for soft delete
      const { encoded, meta } = yield* this.#encode(existing.value, true);

      // Update the item with _d: true and new _uid (soft delete)
      const updateValues: Record<string, unknown> = {
        _data: JSON.stringify(encoded),
        _v: meta._v,
        _uid: meta._uid,
        _d: 1,
        ...this.#deriveSecondaryIndexes({ ...existing.value, _uid: meta._uid }),
      };

      yield* this.#table.updateItem({ pk, sk }, updateValues);

      const deletedEntity = {
        value: existing.value,
        meta,
      };

      yield* this.#broadcast(deletedEntity);

      return deletedEntity;
    });
  }

  /**
   * Queries entities using the primary index or a secondary index.
   *
   * @param key - "primary" for primary index, "timeline" for timeline index, or the secondary index name
   * @param params - Query parameters with pk and sk
   * @param options - Query options including limit
   * @returns Array of matching entities with metadata
   */
  query<
    K extends
      | "primary"
      | (TTimelineDerivation extends StoredTimelineDerivation
          ? "timeline"
          : never)
      | keyof TSecondaryDerivationMap,
  >(
    key: K,
    params: K extends "primary"
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: SkParam }
        : {
            pk: Prettify<IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>>;
            sk: SkParam;
          }
      : K extends "timeline"
        ? [TPrimaryPkKeys] extends [never]
          ? { pk?: {}; sk: SkParam }
          : {
              pk: Prettify<
                IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>
              >;
              sk: SkParam;
            }
        : K extends keyof TSecondaryDerivationMap
          ? {
              pk: Pick<
                ESchemaType<TSchema>,
                TSecondaryDerivationMap[K]["pkDeps"][number] &
                  keyof ESchemaType<TSchema>
              >;
              sk: SkParam;
            }
          : never,
    options?: SimpleQueryOptions,
  ): Effect.Effect<
    { items: EntityType<ESchemaType<TSchema>>[] },
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen(this, function* () {
      const { operator, value: skValue } = extractKeyOp(params.sk as SkParam);
      const scanForward = getKeyOpScanDirection(operator);

      if (key === "primary") {
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
      } else if (key === "timeline") {
        // Timeline index query
        const timeline = this.#timelineDerivation;
        if (!timeline) {
          return yield* Effect.fail(
            SqliteDBError.queryFailed(
              this.#table.tableName,
              "Timeline index not configured",
            ),
          );
        }

        const derivedPk = deriveIndexKeyValue(
          this.#eschema.name,
          timeline.pkDeps,
          (params.pk ?? {}) as Record<string, unknown>,
          true,
        );

        const timelineSkCondition: SortKeyCondition | undefined =
          skValue !== null
            ? ({ [operator]: skValue } as SortKeyCondition)
            : undefined;

        const timelineQueryParams = timelineSkCondition
          ? { pk: derivedPk, sk: timelineSkCondition }
          : { pk: derivedPk };

        const timelineQueryOptions: {
          Limit?: number;
          ScanIndexForward?: boolean;
        } = {
          ScanIndexForward: scanForward,
        };
        if (options?.limit !== undefined) {
          timelineQueryOptions.Limit = options.limit;
        }

        const { Items } = yield* this.#table
          .index(timeline.indexName as any)
          .query(timelineQueryParams, timelineQueryOptions);

        const items = yield* this.#decodeItems(Items);
        return { items };
      } else {
        // Secondary index query
        const indexDerivation = this.#secondaryDerivations[key];

        if (!indexDerivation) {
          return yield* Effect.fail(
            SqliteDBError.queryFailed(
              this.#table.tableName,
              `Index ${String(key)} not found`,
            ),
          );
        }

        const derivedPk = deriveIndexKeyValue(
          indexDerivation.entityIndexName,
          indexDerivation.pkDeps,
          params.pk as Record<string, unknown>,
          true,
        );

        const skConditionSecondary: SortKeyCondition | undefined =
          skValue !== null
            ? ({ [operator]: skValue } as SortKeyCondition)
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
    });
  }

  /**
   * Streams all entities from an index until exhaustion.
   * Uses cursor-based pagination to iterate through all items.
   *
   * @param key - "primary" for primary index, "timeline" for timeline index, or the secondary index name
   * @param params - Query parameters with pk and sk (only > and < operators supported)
   * @param options - Stream options including batchSize
   * @returns A Stream that yields batches of entities
   */
  queryStream<
    K extends
      | "primary"
      | (TTimelineDerivation extends StoredTimelineDerivation
          ? "timeline"
          : never)
      | keyof TSecondaryDerivationMap,
  >(
    key: K,
    params: K extends "primary"
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: StreamSkParam }
        : {
            pk: Prettify<IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>>;
            sk: StreamSkParam;
          }
      : K extends "timeline"
        ? [TPrimaryPkKeys] extends [never]
          ? { pk?: {}; sk: StreamSkParam }
          : {
              pk: Prettify<
                IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>
              >;
              sk: StreamSkParam;
            }
        : K extends keyof TSecondaryDerivationMap
          ? {
              pk: Pick<
                ESchemaType<TSchema>,
                TSecondaryDerivationMap[K]["pkDeps"][number] &
                  keyof ESchemaType<TSchema>
              >;
              sk: StreamSkParam;
            }
          : never,
    options?: QueryStreamOptions,
  ): Stream.Stream<
    EntityType<ESchemaType<TSchema>>[],
    SqliteDBError,
    SqliteDB
  > {
    const batchSize = options?.batchSize ?? 100;
    const operator = ">" in params.sk ? ">" : "<";
    const initialCursor = ">" in params.sk ? params.sk[">"] : params.sk["<"];

    return Stream.paginateChunkEffect(initialCursor, (cursor) =>
      Effect.gen(this, function* () {
        const result = yield* this.query(
          key,
          { pk: params.pk, sk: { [operator]: cursor } as SkParam } as any,
          { limit: batchSize },
        );
        const items = result.items;
        const chunk = Chunk.of(items);

        if (items.length === 0 || items.length < batchSize) {
          return [chunk, Option.none<string | null>()];
        }

        const lastItem = items[items.length - 1]!;
        const nextCursor =
          key === "primary"
            ? ((lastItem.value as Record<string, unknown>)[
                this.#eschema.idField
              ] as string)
            : lastItem.meta._uid;
        return [chunk, Option.some(nextCursor)];
      }),
    );
  }

  /**
   * Subscribes to items from the primary index or a secondary index.
   * Continuously fetches records until no more are available.
   *
   * @param opts.key - "primary", "timeline", or secondary index name
   * @param opts.pk - Partition key fields for the selected index
   * @param opts.cursor - The `_uid` cursor (string to continue from, null to start fresh)
   * @param opts.limit - Optional batch size per query iteration
   * @returns All items after the cursor
   */
  subscribe<
    K extends
      | "primary"
      | (TTimelineDerivation extends StoredTimelineDerivation
          ? "timeline"
          : never)
      | (keyof TSecondaryDerivationMap & string),
  >(
    opts: SubscribeOptions<
      K,
      K extends "primary"
        ? [TPrimaryPkKeys] extends [never]
          ? {}
          : Prettify<IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>>
        : K extends "timeline"
          ? [TPrimaryPkKeys] extends [never]
            ? {}
            : Prettify<IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>>
          : K extends keyof TSecondaryDerivationMap
            ? Pick<
                ESchemaType<TSchema>,
                TSecondaryDerivationMap[K]["pkDeps"][number] &
                  keyof ESchemaType<TSchema>
              >
            : never
    >,
  ): Effect.Effect<{ success: true }, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const { key, pk, cursor, limit } = opts;

      const queryOptions: SimpleQueryOptions = {};
      if (limit !== undefined) {
        queryOptions.limit = limit;
      }

      let currentCursor = cursor;

      while (true) {
        const result = yield* this.query(
          key,
          { pk, sk: { ">": currentCursor } } as any,
          queryOptions,
        );

        (yield* this.#service)?.emit(result.items);

        const lastItem = result.items[result.items.length - 1];
        if (!lastItem) {
          //Start subscribing from now!
          (yield* this.#service)?.subscribe(this.#eschema.name);
          return { success: true };
        }
        currentCursor = lastItem.meta._uid;
      }
    });
  }

  /**
   * Removes all rows from the table.
   */
  dangerouslyRemoveAllRows(
    _: "i know what i am doing",
  ): Effect.Effect<{ rowsDeleted: number }, SqliteDBError, SqliteDB> {
    return this.#table.dangerouslyRemoveAllRows("i know what i am doing");
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  #service = Effect.serviceOption(ConnectionService).pipe(
    Effect.andThen(Option.getOrNull),
  );

  #broadcast(entity: EntityType<ESchemaType<TSchema>>) {
    return Effect.gen(this, function* () {
      const pending = yield* FiberRef.get(TransactionPendingBroadcasts);
      if (Option.isSome(pending)) {
        yield* FiberRef.set(
          TransactionPendingBroadcasts,
          Option.some([...pending.value, entity]),
        );
      } else {
        (yield* this.#service)?.broadcast(entity);
      }
    });
  }

  #prepareInsert(
    fullValue: ESchemaType<TSchema>,
  ): Effect.Effect<
    { item: Record<string, unknown>; meta: RowMeta },
    SqliteDBError
  > {
    return Effect.gen(this, function* () {
      const { encoded, meta } = yield* this.#encode(fullValue, false);

      const valueWithMeta = { ...fullValue, _uid: meta._uid };
      const primaryIndex = this.#derivePrimaryIndex(valueWithMeta);
      const secondaryIndexes = this.#deriveSecondaryIndexes(valueWithMeta);

      const item: Record<string, unknown> = {
        pk: primaryIndex.pk,
        sk: primaryIndex.sk,
        _data: JSON.stringify(encoded),
        _e: this.#eschema.name,
        _v: meta._v,
        _uid: meta._uid,
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
    SqliteDBError
  > {
    return this.#eschema
      .encode(value as Record<string, unknown>)
      .pipe(
        Effect.mapError((e) =>
          SqliteDBError.insertFailed(this.#table.tableName, e),
        ),
      )
      .pipe(
        Effect.map((encoded) => ({
          encoded,
          meta: {
            _e: this.#eschema.name,
            _v: encoded._v as string,
            _uid: new Date().toISOString(),
            _d: deleted,
          },
        })),
      );
  }

  #parseRow(
    row: RawRow,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError> {
    return this.#eschema
      .decode({ ...JSON.parse(row._data), _v: row._v })
      .pipe(
        Effect.mapError((e) =>
          SqliteDBError.queryFailed(this.#table.tableName, e),
        ),
      )
      .pipe(
        Effect.map((value) => ({
          value: value as ESchemaType<TSchema>,
          meta: Schema.decodeSync(sqlMetaSchema)({
            _v: row._v,
            _uid: row._uid,
            _d: row._d,
            _e: row._e ?? this.#eschema.name,
          }),
        })),
      );
  }

  #decodeItems(
    items: RawRow[],
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>[], SqliteDBError> {
    return Effect.all(items.map((item) => this.#parseRow(item)));
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
        deriv.pkDeps.every((key: string) => typeof value[key] !== "undefined")
      ) {
        const pkCol = this.#table.secondaryIndexMap[deriv.indexName]?.pk;
        if (pkCol) {
          indexMap[pkCol] = deriveIndexKeyValue(
            deriv.entityIndexName,
            deriv.pkDeps,
            value,
            true,
          );
        }
      }

      if (
        deriv.skDeps.every((key: string) => typeof value[key] !== "undefined")
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

    // Derive timeline index if configured
    const timeline = this.#timelineDerivation;
    if (timeline) {
      if (
        timeline.pkDeps.every(
          (key: string) => typeof value[key] !== "undefined",
        )
      ) {
        const pkCol = this.#table.secondaryIndexMap[timeline.indexName]?.pk;
        if (pkCol) {
          indexMap[pkCol] = deriveIndexKeyValue(
            this.#eschema.name,
            timeline.pkDeps,
            value,
            true,
          );
        }
      }

      if (typeof value._uid !== "undefined") {
        const skCol = this.#table.secondaryIndexMap[timeline.indexName]?.sk;
        if (skCol) {
          indexMap[skCol] = deriveIndexKeyValue(
            this.#eschema.name,
            timeline.skDeps as unknown as string[],
            value,
            false,
          );
        }
      }
    }

    return indexMap;
  }

  #extractIndexPattern(
    deps: string[],
    prefix: string,
    includePrefix: boolean,
  ): IndexPatternDescriptor {
    if (deps.length === 0) {
      return { deps: [], pattern: prefix };
    }
    const pattern = deps.map((d) => `{${d}}`).join("#");
    return {
      deps,
      pattern: includePrefix ? `${prefix}#${pattern}` : pattern,
    };
  }
}

/**
 * Builder class for configuring entity index derivations.
 */
class EntityIndexDerivations<
  TTable extends SQLiteTableInstance,
  TSchema extends AnyESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TTimelineDerivation extends StoredTimelineDerivation | null = null,
> {
  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: {
    pk: readonly (keyof ESchemaType<TSchema>)[];
    sk: readonly (keyof ESchemaType<TSchema>)[];
  };
  #secondaryDerivations: TSecondaryDerivationMap;
  #timelineDerivation: TTimelineDerivation;

  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: {
      pk: readonly (keyof ESchemaType<TSchema>)[];
      sk: readonly (keyof ESchemaType<TSchema>)[];
    },
    definitions: TSecondaryDerivationMap,
    timelineDerivation?: TTimelineDerivation,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = definitions;
    this.#timelineDerivation = (timelineDerivation ??
      null) as TTimelineDerivation;
  }

  /**
   * Maps a table index to a semantic entity index with custom derivation.
   * SK is automatically set to `_uid` for secondary indexes.
   *
   * @typeParam IndexName - The index name on the table
   * @typeParam TPkKeys - Fields used for partition key derivation
   * @param indexName - The index name on the table (e.g., "IDX1")
   * @param entityIndexName - The semantic name for this entity's use of the index (e.g., "byEmail")
   * @param derivation - The pk field array (sk is automatically _uid)
   * @returns A builder with the index mapping added
   */
  index<
    IndexNameStr extends keyof TTable["secondaryIndexMap"] & string,
    EntityIndexName extends string,
    const TPkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[],
  >(
    indexName: IndexNameStr,
    entityIndexName: EntityIndexName,
    derivation: {
      pk: TPkKeys;
    },
  ) {
    // SK is always _uid for secondary indexes
    const skKeys = ["_uid"] as const;
    const newDeriv: StoredIndexDerivation = {
      indexName,
      entityIndexName,
      pkDeps: derivation.pk.map(String),
      skDeps: [...skKeys],
    };

    return new EntityIndexDerivations(
      this.#table,
      this.#eschema,
      this.#primaryDerivation,
      {
        ...this.#secondaryDerivations,
        [entityIndexName]: newDeriv,
      },
    ) as EntityIndexDerivations<
      TTable,
      TSchema,
      TPrimaryPkKeys,
      TSecondaryDerivationMap &
        Record<
          EntityIndexName,
          StoredIndexDerivation & {
            pkDeps: TPkKeys;
            skDeps: typeof skKeys;
          }
        >,
      TTimelineDerivation
    >;
  }

  /**
   * Configures a timeline index using the same PK as primary but SK = _uid.
   * This enables time-ordered queries on the same partition.
   *
   * @typeParam IndexName - The index name on the table
   * @param indexName - The index name on the table (e.g., "IDX1")
   * @returns A builder with the timeline index configured
   */
  timeline<IndexName extends keyof TTable["secondaryIndexMap"] & string>(
    indexName: IndexName,
  ) {
    const timelineDerivation: StoredTimelineDerivation = {
      indexName,
      entityIndexName: "timeline",
      pkDeps: this.#primaryDerivation.pk.map(String),
      skDeps: ["_uid"] as const,
    };

    return new EntityIndexDerivations<
      TTable,
      TSchema,
      TPrimaryPkKeys,
      TSecondaryDerivationMap,
      StoredTimelineDerivation
    >(
      this.#table,
      this.#eschema,
      this.#primaryDerivation,
      this.#secondaryDerivations,
      timelineDerivation,
    );
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

    return new SQLiteEntity<
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys,
      TTimelineDerivation
    >(
      this.#table,
      this.#eschema,
      storedPrimary,
      this.#secondaryDerivations,
      this.#timelineDerivation,
    );
  }
}
