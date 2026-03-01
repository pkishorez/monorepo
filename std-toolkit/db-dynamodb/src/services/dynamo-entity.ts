import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Chunk, Effect, Option, Schema, Stream } from "effect";
import type { DynamoTableInstance } from "./dynamo-table.js";
import { ConnectionService } from "@std-toolkit/core/server";
import { DynamodbError } from "../errors.js";
import type {
  IndexDefinition,
  IndexPkValue,
  TransactItem,
  SkParam,
  StreamSkParam,
  SimpleQueryOptions,
  QueryStreamOptions,
  SubscribeOptions,
} from "../types/index.js";
import { extractKeyOp, getKeyOpScanDirection } from "../types/index.js";
import type { StdDescriptor, IndexPatternDescriptor } from "@std-toolkit/core";
import { deriveIndexKeyValue } from "../internal/index.js";
import {
  buildExpr,
  type ConditionExprResult,
  type UpdateExprResult,
} from "../expr/build-expr.js";
import { exprCondition, type ConditionOperation } from "../expr/condition.js";
import { exprUpdate } from "../expr/update.js";
import type { SortKeyparameter } from "../expr/key-condition.js";

/**
 * Schema for entity metadata stored with each item.
 */
const metaSchema = Schema.Struct({
  /** Entity name */
  _e: Schema.String,
  /** Schema version */
  _v: Schema.String,
  /** ISO timestamp that changes on every write */
  _uid: Schema.String,
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
type DerivableMetaFields = "_uid";

/**
 * Checks if an error is a conditional check failure from DynamoDB.
 *
 * @param e - The DynamoDB error to check
 * @returns True if the error is a conditional check failure
 */
const isConditionalCheckFailed = (e: DynamodbError): boolean => {
  if (!("cause" in e.error)) return false;
  const cause = e.error.cause as DynamodbError | undefined;
  return (
    cause?.error._tag === "UnknownAwsError" &&
    cause.error.name === "ConditionalCheckFailedException"
  );
};

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
type InsertInput<T> = Omit<T, "_v">;

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
 * Stored derivation info for a timeline index.
 * Uses the same PK as primary but SK is always _uid for time-ordering.
 */
export interface StoredTimelineDerivation {
  /** The actual GSI name on the table (e.g., "GSI1") */
  gsiName: string;
  /** Always "timeline" */
  entityIndexName: "timeline";
  /** Field names used to derive the partition key (same as primary) */
  pkDeps: string[];
  /** Always ["_uid"] for time-ordered results */
  skDeps: readonly ["_uid"];
}

/**
 * Helper type to extract the key type from an array of keys.
 * For empty arrays, returns never so Pick<T, never> = {}
 */
type ExtractKeys<T, Keys extends readonly (keyof T)[]> = Keys[number];

/**
 * A DynamoDB entity with type-safe CRUD operations and automatic index derivation.
 * Entities are built on top of a DynamoTable and use an ESchema for validation.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TSecondaryDerivationMap - Map of secondary index derivations
 * @typeParam TSchema - The ESchema type for this entity
 * @typeParam TPrimaryPkKeys - Keys used for primary partition key derivation
 * @typeParam TTimelineDerivation - Timeline derivation (or null if not configured)
 */
export class DynamoEntity<
  TTable extends DynamoTableInstance,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
  TTimelineDerivation extends StoredTimelineDerivation | null = null,
> {
  /**
   * Creates a new entity builder for the given table.
   *
   * @typeParam TTable - The DynamoTable instance type
   * @param table - The DynamoTable instance
   * @returns A builder to configure the entity schema
   */
  static make<TTable extends DynamoTableInstance>(table: TTable) {
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

  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: StoredPrimaryDerivation;
  #secondaryDerivations: TSecondaryDerivationMap;
  #timelineDerivation: TTimelineDerivation;

  #service = Effect.serviceOption(ConnectionService).pipe(
    Effect.andThen(Option.getOrNull),
  );

  #broadcast(entity: EntityType<ESchemaType<TSchema>>) {
    return Effect.gen(this, function* () {
      (yield* this.#service)?.broadcast(entity);
    });
  }

  constructor(
    table: TTable,
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
   * Gets the unified descriptor for this entity including schema and index info.
   *
   * @returns The StdDescriptor for this entity
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
   * @param options - Optional read options
   * @returns The entity if found, or null
   */
  get(
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema["idField"]>,
    options?: { ConsistentRead?: boolean },
  ): Effect.Effect<EntityType<ESchemaType<TSchema>> | null, DynamodbError> {
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

      const { Item } = yield* this.#table.getItem({ pk, sk }, options);

      if (!Item) return null;

      const value = yield* this.#eschema
        .decode(Item)
        .pipe(Effect.mapError((e) => DynamodbError.getItemFailed(e)));

      const meta = Schema.decodeUnknownSync(metaSchema)(Item);

      return {
        value: value as ESchemaType<TSchema>,
        meta,
      };
    });
  }

  /**
   * Inserts a new entity. Fails if an item with the same key already exists.
   *
   * @param value - The entity value to insert
   * @param options - Insert options including condition
   * @returns The inserted entity with metadata
   */
  insert(
    value: InsertInput<ESchemaType<TSchema>>,
    options?: {
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, DynamodbError> {
    const self = this;
    return Effect.gen(function* () {
      const fullValueWithId = {
        ...value,
        _v: self.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const { item, exprResult, meta, fullValue } = yield* self.#prepareInsert(
        fullValueWithId,
        options?.condition,
      );

      yield* self.#table
        .putItem(item, { ReturnValues: "ALL_OLD", ...exprResult })
        .pipe(
          Effect.catchIf(
            (e): e is DynamodbError =>
              e.error._tag === "PutItemFailed" && isConditionalCheckFailed(e),
            () => Effect.fail(DynamodbError.itemAlreadyExists()),
          ),
        );

      const entity = { value: fullValue, meta };
      yield* self.#broadcast(entity);
      return entity;
    });
  }

  /**
   * Updates an existing entity by its primary key.
   *
   * @param keyValue - Object containing the primary key field values
   * @param updates - Partial entity with fields to update
   * @param options - Update options including condition
   * @returns The updated entity with new metadata
   */
  update(
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema["idField"]>,
    updates: Partial<Omit<ESchemaType<TSchema>, "_v">>,
    options?: {
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, DynamodbError> {
    const self = this;
    return Effect.gen(function* () {
      const { pk, sk, exprResult } = self.#prepareUpdate(
        keyValue as Record<string, unknown>,
        updates,
        options,
      );

      const result = yield* self.#table
        .updateItem({ pk, sk }, { ReturnValues: "ALL_NEW", ...exprResult })
        .pipe(
          Effect.mapError(
            (e): DynamodbError =>
              e.error._tag === "UpdateItemFailed" && isConditionalCheckFailed(e)
                ? DynamodbError.noItemToUpdate()
                : e,
          ),
        );

      if (!result.Attributes) {
        return yield* Effect.fail(DynamodbError.noItemToUpdate());
      }

      const decodedValue = yield* self.#eschema
        .decode(result.Attributes)
        .pipe(Effect.mapError((e) => DynamodbError.updateItemFailed(e)));

      const updatedMeta = Schema.decodeUnknownSync(metaSchema)(
        result.Attributes,
      );

      const entity = {
        value: decodedValue as ESchemaType<TSchema>,
        meta: updatedMeta,
      };
      yield* self.#broadcast(entity);
      return entity;
    });
  }

  /**
   * Soft deletes an entity by setting the _d flag to true.
   *
   * @param keyValue - Object containing the primary key field values
   * @returns The deleted entity with _d flag set to true
   */
  delete(
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema["idField"]>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, DynamodbError> {
    return Effect.gen(this, function* () {
      const existing = yield* this.get(keyValue);
      if (!existing) {
        return yield* Effect.fail(DynamodbError.noItemToDelete());
      }

      const result = yield* this.update(keyValue, { _d: true } as any);

      return result;
    });
  }

  /**
   * Creates an insert operation for use in a transaction.
   * Includes broadcast data for emitting changes after successful transaction.
   *
   * @param value - The entity value to insert
   * @param options - Insert options including condition
   * @returns A transaction item for insert with broadcast data
   */
  insertOp(
    value: InsertInput<ESchemaType<TSchema>>,
    options?: {
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<TransactItem<TSchema["name"]>, DynamodbError> {
    return Effect.gen(this, function* () {
      const fullValueWithId = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const { item, exprResult, meta, fullValue } = yield* this.#prepareInsert(
        fullValueWithId,
        options?.condition,
      );

      const tableOp = this.#table.opPutItem(item, exprResult);
      return {
        ...tableOp,
        entityName: this.#eschema.name,
        broadcast: { value: fullValue, meta },
      };
    });
  }

  /**
   * Creates an update operation for use in a transaction.
   * Pre-fetches the existing entity to include complete broadcast data.
   *
   * @param keyValue - Object containing the primary key field values
   * @param updates - Partial entity with fields to update
   * @param options - Update options including condition
   * @returns A transaction item for update with broadcast data
   */
  updateOp(
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema["idField"]>,
    updates: Partial<Omit<ESchemaType<TSchema>, "_v">>,
    options?: {
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<TransactItem<TSchema["name"]>, DynamodbError> {
    return Effect.gen(this, function* () {
      // Pre-fetch existing entity to get complete data for broadcast
      const existing = yield* this.get(keyValue);
      if (!existing) {
        return yield* Effect.fail(DynamodbError.noItemToUpdate());
      }

      const { pk, sk, exprResult, meta } = this.#prepareUpdate(
        keyValue as Record<string, unknown>,
        updates,
        options,
      );

      // Merge existing value with updates for broadcast
      const mergedValue = {
        ...existing.value,
        ...updates,
      } as ESchemaType<TSchema>;

      const tableOp = this.#table.opUpdateItem({ pk, sk }, exprResult);
      return {
        ...tableOp,
        entityName: this.#eschema.name,
        broadcast: { value: mergedValue, meta },
      };
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
  query<
    K extends
      | "primary"
      | (TTimelineDerivation extends StoredTimelineDerivation
          ? "timeline"
          : never)
      | (keyof TSecondaryDerivationMap & string),
  >(
    key: K,
    params: K extends "primary"
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: SkParam }
        : {
            pk: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>;
            sk: SkParam;
          }
      : K extends "timeline"
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
                TSecondaryDerivationMap[K]["pkDeps"][number] &
                  keyof ESchemaType<TSchema>
              >;
              sk: SkParam;
            }
          : never,
    options?: SimpleQueryOptions,
  ): Effect.Effect<
    { items: EntityType<ESchemaType<TSchema>>[] },
    DynamodbError
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

        const skCondition: SortKeyparameter | undefined =
          skValue !== null
            ? ({ [operator]: skValue } as SortKeyparameter)
            : undefined;

        const queryOptions: { Limit?: number; ScanIndexForward?: boolean } = {
          ScanIndexForward: scanForward,
        };
        if (options?.limit !== undefined) {
          queryOptions.Limit = options.limit;
        }

        const { Items } = yield* this.#table.query(
          { pk: derivedPk, sk: skCondition },
          queryOptions,
        );

        const items = yield* this.#decodeItems(Items);
        return { items };
      } else if (key === "timeline") {
        // Timeline index query
        const timeline = this.#timelineDerivation;
        if (!timeline) {
          return yield* Effect.fail(
            DynamodbError.queryFailed("Timeline index not configured"),
          );
        }

        const derivedPk = deriveIndexKeyValue(
          this.#eschema.name,
          timeline.pkDeps,
          (params.pk ?? {}) as Record<string, unknown>,
          true,
        );

        const skCondition: SortKeyparameter | undefined =
          skValue !== null
            ? ({ [operator]: skValue } as SortKeyparameter)
            : undefined;

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
          .index(timeline.gsiName as any)
          .query({ pk: derivedPk, sk: skCondition }, timelineQueryOptions);

        const items = yield* this.#decodeItems(Items);
        return { items };
      } else {
        // Secondary index query
        const indexDerivation = this.#secondaryDerivations[key];

        if (!indexDerivation) {
          return yield* Effect.fail(
            DynamodbError.queryFailed(`Index ${String(key)} not found`),
          );
        }

        const derivedPk = deriveIndexKeyValue(
          indexDerivation.entityIndexName,
          indexDerivation.pkDeps,
          params.pk as Record<string, unknown>,
          true,
        );

        const skCondition: SortKeyparameter | undefined =
          skValue !== null
            ? ({ [operator]: skValue } as SortKeyparameter)
            : undefined;

        const gsiQueryOptions: { Limit?: number; ScanIndexForward?: boolean } =
          {
            ScanIndexForward: scanForward,
          };
        if (options?.limit !== undefined) {
          gsiQueryOptions.Limit = options.limit;
        }

        const { Items } = yield* this.#table
          .index(indexDerivation.gsiName as any)
          .query({ pk: derivedPk, sk: skCondition }, gsiQueryOptions);

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
      | (keyof TSecondaryDerivationMap & string),
  >(
    key: K,
    params: K extends "primary"
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: StreamSkParam }
        : {
            pk: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>;
            sk: StreamSkParam;
          }
      : K extends "timeline"
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
                TSecondaryDerivationMap[K]["pkDeps"][number] &
                  keyof ESchemaType<TSchema>
              >;
              sk: StreamSkParam;
            }
          : never,
    options?: QueryStreamOptions,
  ): Stream.Stream<EntityType<ESchemaType<TSchema>>[], DynamodbError> {
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
        const nextCursor: string | null =
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
          : IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>
        : K extends "timeline"
          ? [TPrimaryPkKeys] extends [never]
            ? {}
            : IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>
          : K extends keyof TSecondaryDerivationMap
            ? Pick<
                ESchemaType<TSchema>,
                TSecondaryDerivationMap[K]["pkDeps"][number] &
                  keyof ESchemaType<TSchema>
              >
            : never
    >,
  ): Effect.Effect<{ success: true }, DynamodbError> {
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
          (yield* this.#service)?.subscribe(this.#eschema.name);
          return { success: true };
        }
        currentCursor = lastItem.meta._uid;
      }
    });
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
        deriv.pkDeps.every((key: string) => typeof value[key] !== "undefined")
      ) {
        const pkKey = `${deriv.gsiName}PK`;
        indexMap[pkKey] = deriveIndexKeyValue(
          deriv.entityIndexName,
          deriv.pkDeps,
          value,
          true,
        );
      }

      if (
        deriv.skDeps.every((key: string) => typeof value[key] !== "undefined")
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

    // Derive timeline index if configured
    const timeline = this.#timelineDerivation;
    if (timeline) {
      if (
        timeline.pkDeps.every(
          (key: string) => typeof value[key] !== "undefined",
        )
      ) {
        const pkKey = `${timeline.gsiName}PK`;
        indexMap[pkKey] = deriveIndexKeyValue(
          this.#eschema.name,
          timeline.pkDeps,
          value,
          true,
        );
      }

      if (typeof value._uid !== "undefined") {
        const skKey = `${timeline.gsiName}SK`;
        indexMap[skKey] = deriveIndexKeyValue(
          this.#eschema.name,
          timeline.skDeps as unknown as string[],
          value,
          false,
        );
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
    condition?: ConditionOperation<ESchemaType<TSchema>>,
  ): Effect.Effect<
    {
      item: Record<string, unknown>;
      exprResult: ConditionExprResult;
      meta: MetaType;
      fullValue: ESchemaType<TSchema>;
    },
    DynamodbError
  > {
    return Effect.gen(this, function* () {
      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => DynamodbError.putItemFailed(e)));

      const _uid = new Date().toISOString();

      const meta: MetaType = {
        _e: this.#eschema.name,
        _v: this.#eschema.latestVersion,
        _uid,
        _d: false,
      };

      const valueWithMeta = { ...fullValue, _uid };
      const primaryIndex = this.#derivePrimaryIndex(valueWithMeta);
      const indexMap = this.#deriveSecondaryIndexes(valueWithMeta);

      const item = {
        ...encoded,
        ...meta,
        [this.#table.primary.pk]: primaryIndex.pk,
        [this.#table.primary.sk]: primaryIndex.sk,
        ...indexMap,
      };

      const exprResult = buildExpr({
        condition: exprCondition(($) =>
          $.and(
            ...([
              condition,
              $.attributeNotExists(this.#table.primary.pk as any),
              $.attributeNotExists(this.#table.primary.sk as any),
            ].filter(Boolean) as ConditionOperation[]),
          ),
        ),
      });

      return { item, exprResult, meta, fullValue };
    });
  }

  #prepareUpdate(
    keyValue: Record<string, unknown>,
    updates: Partial<Omit<ESchemaType<TSchema>, "_v">>,
    options?: {
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): { pk: string; sk: string; exprResult: UpdateExprResult; meta: MetaType } {
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

    const _uid = new Date().toISOString();
    const updatesWithMeta = { ...updates, _uid };
    const indexMap = this.#deriveSecondaryIndexes(updatesWithMeta);

    const meta: MetaType = {
      _e: this.#eschema.name,
      _v: this.#eschema.latestVersion,
      _uid,
      _d: (updates as any)._d ?? false,
    };

    const conditionOps: ConditionOperation[] = [
      exprCondition(($) =>
        $.cond("_v" as any, "=", this.#eschema.latestVersion),
      ),
    ];
    if (options?.condition) conditionOps.push(options.condition);

    const condition = exprCondition(($) => $.and(...conditionOps));

    const update = exprUpdate<any>(($) => [
      ...Object.entries({ ...updates, ...indexMap }).map(([key, v]) =>
        $.set(key, v),
      ),
      $.set("_uid", _uid),
    ]);

    const exprResult = buildExpr({
      update,
      condition,
    });

    return { pk, sk, exprResult, meta };
  }
}

/**
 * Builder class for configuring entity index derivations.
 */
class EntityIndexDerivations<
  TTable extends DynamoTableInstance,
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
   * Maps a table GSI to a semantic entity index with custom derivation.
   * SK is automatically set to `_uid` for secondary indexes.
   *
   * @typeParam GsiName - The GSI name on the table
   * @typeParam TPkKeys - Fields used for partition key derivation
   * @param gsiName - The GSI name on the table (e.g., "GSI1")
   * @param entityIndexName - The semantic name for this entity's use of the GSI (e.g., "byEmail")
   * @param derivation - The pk field array (sk is automatically _uid)
   * @returns A builder with the index mapping added
   */
  index<
    GsiName extends keyof TTable["secondaryIndexMap"] & string,
    const TEntityIndexName extends string,
    const TPkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[],
  >(
    gsiName: GsiName,
    entityIndexName: TEntityIndexName,
    derivation: {
      pk: TPkKeys;
    },
  ) {
    // SK is always _uid for secondary indexes
    const skKeys = ["_uid"] as const;
    const newDeriv: StoredIndexDerivation = {
      gsiName,
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
          TEntityIndexName,
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
   * @typeParam GsiName - The GSI name on the table
   * @param gsiName - The GSI name on the table (e.g., "GSI1")
   * @returns A builder with the timeline index configured
   */
  timeline<GsiName extends keyof TTable["secondaryIndexMap"] & string>(
    gsiName: GsiName,
  ) {
    const timelineDerivation: StoredTimelineDerivation = {
      gsiName,
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
   * Builds the final DynamoEntity instance.
   *
   * @returns The configured DynamoEntity
   */
  build() {
    const storedPrimary: StoredPrimaryDerivation = {
      pkDeps: this.#primaryDerivation.pk.map(String),
      skDeps: this.#primaryDerivation.sk.map(String),
    };

    return new DynamoEntity<
      TTable,
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
