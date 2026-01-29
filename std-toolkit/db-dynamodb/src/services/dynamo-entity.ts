import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Effect, Option, Schema } from "effect";
import type { DynamoTableInstance } from "./dynamo-table.js";
import { ConnectionService } from "@std-toolkit/core/server";
import { DynamodbError } from "../errors.js";
import type {
  IndexDefinition,
  IndexPkValue,
  TransactItem,
  SkParam,
  SimpleQueryOptions,
  SubscribeOptions,
} from "../types/index.js";
import { extractKeyOp, getKeyOpScanDirection } from "../types/index.js";
import type { StdDescriptor, IndexPatternDescriptor } from "@std-toolkit/core";
import {
  deriveIndexKeyValue,
  toDiscriminatedGeneric,
  fromDiscriminatedGeneric,
  generateUlid,
} from "../internal/index.js";
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
  /** ULID that changes on every write */
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
 * Makes the ID field optional for insert operations and accepts plain strings.
 * When not provided, a ULID will be auto-generated.
 */
type InsertInput<T, IdField extends string> = Omit<T, IdField | "_v"> & {
  [K in IdField & keyof T]?: string;
};

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
 * Helper type to extract all key fields from a derivation's pkDeps and skDeps.
 */
type DerivationKeyFields<TDeriv extends StoredIndexDerivation> =
  | TDeriv["pkDeps"][number]
  | TDeriv["skDeps"][number];

/**
 * Helper type to get the key value type for a given index.
 * For "primary", returns the primary key fields (pk deps + idField for SK).
 * For secondary indexes, returns the index's pk deps (SK is always _uid).
 */
type IndexKeyValue<
  TSchema extends AnyESchema,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
  K extends "primary" | (keyof TSecondaryDerivationMap & string),
> = K extends "primary"
  ? Pick<ESchemaType<TSchema>, TPrimaryPkKeys | TSchema["idField"]>
  : K extends keyof TSecondaryDerivationMap
    ? Pick<
        ESchemaType<TSchema>,
        DerivationKeyFields<TSecondaryDerivationMap[K]> &
          keyof ESchemaType<TSchema>
      >
    : never;

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
   * The ID field is optional - if not provided, a ULID will be auto-generated.
   *
   * @param value - The entity value to insert (ID field is optional)
   * @param options - Insert options including ignoreIfAlreadyPresent and condition
   * @returns The inserted entity with metadata
   */
  insert(
    value: InsertInput<ESchemaType<TSchema>, TSchema["idField"]>,
    options?: {
      ignoreIfAlreadyPresent?: boolean;
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, DynamodbError> {
    const self = this;
    return Effect.gen(function* () {
      // Handle optional idField - auto-generate if not provided
      const idField = self.#eschema.idField;
      const providedId = (value as Record<string, unknown>)[idField];
      const generatedId = providedId ?? generateUlid();

      const fullValueWithId = {
        ...value,
        [idField]: generatedId as string,
        _v: self.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const { item, exprResult, meta, fullValue } = yield* self.#prepareInsert(
        fullValueWithId,
        options?.condition,
      );

      const putResult = yield* self.#table
        .putItem(item, { ReturnValues: "ALL_OLD", ...exprResult })
        .pipe(
          Effect.map(() => ({ alreadyExisted: false })),
          Effect.catchIf(
            (e): e is DynamodbError =>
              e.error._tag === "PutItemFailed" && isConditionalCheckFailed(e),
            () =>
              options?.ignoreIfAlreadyPresent
                ? Effect.succeed({ alreadyExisted: true })
                : Effect.fail(DynamodbError.itemAlreadyExists()),
          ),
        );

      if (putResult.alreadyExisted) {
        const existing = yield* self.get(
          value as unknown as IndexPkValue<
            ESchemaType<TSchema>,
            TPrimaryPkKeys
          > &
            Pick<ESchemaType<TSchema>, TSchema["idField"]>,
        );
        if (!existing) {
          return yield* Effect.fail(
            DynamodbError.getItemFailed("Item not found after insert conflict"),
          );
        }
        yield* self.#broadcast(existing);
        return existing;
      }

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
   * The ID field is optional - if not provided, a ULID will be auto-generated.
   * Includes broadcast data for emitting changes after successful transaction.
   *
   * @param value - The entity value to insert (ID field is optional)
   * @param options - Insert options including condition
   * @returns A transaction item for insert with broadcast data
   */
  insertOp(
    value: InsertInput<ESchemaType<TSchema>, TSchema["idField"]>,
    options?: {
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<TransactItem<TSchema["name"]>, DynamodbError> {
    return Effect.gen(this, function* () {
      // Handle optional idField - auto-generate if not provided
      const idField = this.#eschema.idField;
      const providedId = (value as Record<string, unknown>)[idField];
      const generatedId = providedId ?? generateUlid();

      const fullValueWithId = {
        ...value,
        [idField]: generatedId as string,
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
   * Subscribes to items from the primary index or a secondary index.
   * Returns items after the given cursor value.
   *
   * @param opts - Subscribe options with key, cursor value, and limit
   * @returns Array of items after the cursor
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
      IndexKeyValue<TSchema, TSecondaryDerivationMap, TPrimaryPkKeys, K>
    >,
  ): Effect.Effect<
    { items: EntityType<ESchemaType<TSchema>>[] },
    DynamodbError
  > {
    const { key, value, limit } = opts;

    if (value == null) {
      // No cursor - this is a special case, return empty for now
      // In a real implementation, you might want to query from the beginning
      return Effect.succeed({ items: [] });
    }

    const queryOptions: SimpleQueryOptions = {};
    if (limit !== undefined) {
      queryOptions.limit = limit;
    }

    const { pkDeps, skDeps } =
      key === "primary"
        ? this.#primaryDerivation
        : key === "timeline"
          ? {
              pkDeps: this.#timelineDerivation?.pkDeps ?? [],
              skDeps: ["_uid"] as string[],
            }
          : this.#secondaryDerivations[key as keyof TSecondaryDerivationMap]!;

    const cursorValue = value as Record<string, unknown>;
    const pkPart: Record<string, unknown> = {};

    for (const dep of pkDeps) {
      pkPart[dep] = cursorValue[dep];
    }

    // Derive the SK value as a string from the cursor
    const skString = deriveIndexKeyValue(
      this.#eschema.name,
      skDeps,
      cursorValue,
      false,
    );

    return this.query(
      key,
      { pk: pkPart, sk: { ">": skString } } as any,
      queryOptions,
    );
  }

  /**
   * Provides raw query access for complex queries with between, beginsWith, filters, etc.
   */
  get raw() {
    const self = this;
    return {
      /**
       * Raw query for complex conditions on primary or secondary indexes.
       *
       * @param key - "primary" for primary index, or the secondary index name
       * @param params - Query parameters with pk value and optional sk condition
       * @param options - Query options including limit, sort order, and filter
       * @returns Array of matching entities with metadata
       */
      query: <
        K extends
          | "primary"
          | (TTimelineDerivation extends StoredTimelineDerivation
              ? "timeline"
              : never)
          | (keyof TSecondaryDerivationMap & string),
      >(
        key: K,
        params: K extends "primary"
          ? {
              pk: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>;
              sk?: SortKeyparameter<
                Pick<ESchemaType<TSchema>, TSchema["idField"]>
              >;
            }
          : K extends "timeline"
            ? {
                pk: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>;
                sk?: SortKeyparameter<{ _uid: string }>;
              }
            : K extends keyof TSecondaryDerivationMap
              ? {
                  pk: Pick<
                    ESchemaType<TSchema>,
                    TSecondaryDerivationMap[K]["pkDeps"][number] &
                      keyof ESchemaType<TSchema>
                  >;
                  sk?: SortKeyparameter<
                    Pick<
                      ESchemaType<TSchema>,
                      TSecondaryDerivationMap[K]["skDeps"][number] &
                        keyof ESchemaType<TSchema>
                    >
                  >;
                }
              : never,
        options?: {
          Limit?: number;
          ScanIndexForward?: boolean;
          filter?: ConditionOperation<ESchemaType<TSchema>>;
        },
      ): Effect.Effect<
        { items: EntityType<ESchemaType<TSchema>>[] },
        DynamodbError
      > => {
        return Effect.gen(self, function* () {
          if (key === "primary") {
            // Primary index query
            const derivedPk = deriveIndexKeyValue(
              self.#eschema.name,
              self.#primaryDerivation.pkDeps,
              params.pk as Record<string, unknown>,
              true,
            );
            const derivedSk = params.sk
              ? self.#calculateSk(
                  self.#primaryDerivation.skDeps,
                  params.sk as any,
                )
              : undefined;

            const { Items } = yield* self.#table.query(
              { pk: derivedPk, sk: derivedSk as any },
              options,
            );

            const items = yield* self.#decodeItems(Items);
            return { items };
          } else if (key === "timeline") {
            // Timeline index query
            const timeline = self.#timelineDerivation;
            if (!timeline) {
              return yield* Effect.fail(
                DynamodbError.queryFailed("Timeline index not configured"),
              );
            }

            const derivedPk = deriveIndexKeyValue(
              self.#eschema.name,
              timeline.pkDeps,
              params.pk as Record<string, unknown>,
              true,
            );
            const derivedSk = params.sk
              ? self.#calculateSk(
                  timeline.skDeps as unknown as string[],
                  params.sk as any,
                )
              : undefined;

            const { Items } = yield* self.#table
              .index(timeline.gsiName as any)
              .query({ pk: derivedPk, sk: derivedSk as any }, options);

            const items = yield* self.#decodeItems(Items);
            return { items };
          } else {
            // Secondary index query
            const indexDerivation = self.#secondaryDerivations[key];

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
            const derivedSk = params.sk
              ? self.#calculateSk(indexDerivation.skDeps, params.sk as any)
              : undefined;

            const { Items } = yield* self.#table
              .index(indexDerivation.gsiName as any)
              .query({ pk: derivedPk, sk: derivedSk as any }, options);

            const items = yield* self.#decodeItems(Items);
            return { items };
          }
        });
      },
    };
  }

  #calculateSk(
    skDeps: string[],
    sk: SortKeyparameter,
  ): SortKeyparameter | string {
    const realSk = toDiscriminatedGeneric(sk as Record<string, any>);
    const entityName = this.#eschema.name;

    switch (realSk.type) {
      case "<":
      case "<=":
      case ">":
      case ">=":
        if (realSk.value == null) break;
        realSk.value = deriveIndexKeyValue(
          entityName,
          skDeps,
          realSk.value as Record<string, unknown>,
          false,
        );
        break;
      case "between":
        if (realSk.value) {
          (realSk.value as any)[0] = deriveIndexKeyValue(
            entityName,
            skDeps,
            (realSk.value as any)[0] as Record<string, unknown>,
            false,
          );
          (realSk.value as any)[1] = deriveIndexKeyValue(
            entityName,
            skDeps,
            (realSk.value as any)[1] as Record<string, unknown>,
            false,
          );
        }
        break;
      case "beginsWith":
        if (realSk.value != null) {
          realSk.value = deriveIndexKeyValue(
            entityName,
            skDeps,
            realSk.value as Record<string, unknown>,
            false,
          );
        }
        break;
    }

    return fromDiscriminatedGeneric(realSk) as SortKeyparameter;
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

      const _uid = generateUlid();

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

    const _uid = generateUlid();
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
