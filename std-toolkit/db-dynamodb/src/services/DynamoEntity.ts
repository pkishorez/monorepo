import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Effect, Schema } from "effect";
import type { DynamoTableInstance } from "./DynamoTable.js";
import { DynamodbError } from "../errors.js";
import type {
  IndexDefinition,
  IndexPkValue,
  IndexSkValue,
  TransactItem,
} from "../types/index.js";
import type { StdDescriptor, IndexPatternDescriptor } from "@std-toolkit/core";
import {
  deriveIndexKeyValue,
  toDiscriminatedGeneric,
  fromDiscriminatedGeneric,
  generateUlid,
} from "../internal/index.js";
import { buildExpr } from "../expr/build-expr.js";
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
  /** ULID for this version of the item */
  _u: Schema.String,
  /** Optimistic locking increment counter */
  _i: Schema.Number,
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
type DerivableMetaFields = "_u";

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
 * @typeParam TPrimarySkKeys - Keys used for primary sort key derivation
 */
export class DynamoEntity<
  TTable extends DynamoTableInstance,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
  TPrimarySkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
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
           *
           * @param primaryDerivation - The pk and sk field arrays
           * @returns A builder to add secondary index mappings
           */
          primary<
            const TPkKeys extends readonly (keyof ESchemaType<TS> | DerivableMetaFields)[],
            const TSkKeys extends readonly (keyof ESchemaType<TS> | DerivableMetaFields)[],
          >(primaryDerivation: { pk: TPkKeys; sk: TSkKeys }) {
            return new EntityIndexDerivations<
              TTable,
              TS,
              ExtractKeys<ESchemaType<TS>, TPkKeys>,
              ExtractKeys<ESchemaType<TS>, TSkKeys>,
              {}
            >(table, eschema, primaryDerivation as any, {});
          },
        };
      },
    };
  }

  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: StoredPrimaryDerivation;
  #secondaryDerivations: TSecondaryDerivationMap;

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
    return {
      name: this.#eschema.name,
      version: this.#eschema.latestVersion,
      primaryIndex: {
        name: "primary",
        pk: this.#extractPrimaryPkPattern(),
        sk: this.#extractPrimarySkPattern(),
      },
      secondaryIndexes: Object.entries(this.#secondaryDerivations).map(
        ([, deriv]) => ({
          name: deriv.entityIndexName,
          pk: this.#extractGsiPkPattern(deriv),
          sk: this.#extractGsiSkPattern(deriv),
        }),
      ),
      schema: this.#eschema.getDescriptor(),
    };
  }

  #extractPrimaryPkPattern(): IndexPatternDescriptor {
    const deps = this.#primaryDerivation.pkDeps;
    const entityName = this.#eschema.name;
    if (deps.length === 0) {
      return { deps: [], pattern: entityName };
    }
    return {
      deps,
      pattern: `${entityName}#${deps.map((d) => `{${d}}`).join("#")}`,
    };
  }

  #extractPrimarySkPattern(): IndexPatternDescriptor {
    const deps = this.#primaryDerivation.skDeps;
    const entityName = this.#eschema.name;
    if (deps.length === 0) {
      return { deps: [], pattern: entityName };
    }
    return { deps, pattern: deps.map((d) => `{${d}}`).join("#") };
  }

  #extractGsiPkPattern(deriv: StoredIndexDerivation): IndexPatternDescriptor {
    const deps = deriv.pkDeps;
    const indexName = deriv.entityIndexName;
    if (deps.length === 0) {
      return { deps: [], pattern: indexName };
    }
    return {
      deps,
      pattern: `${indexName}#${deps.map((d) => `{${d}}`).join("#")}`,
    };
  }

  #extractGsiSkPattern(deriv: StoredIndexDerivation): IndexPatternDescriptor {
    const deps = deriv.skDeps;
    const entityName = this.#eschema.name;
    if (deps.length === 0) {
      return { deps: [], pattern: entityName };
    }
    return { deps, pattern: deps.map((d) => `{${d}}`).join("#") };
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
      IndexSkValue<ESchemaType<TSchema>, TPrimarySkKeys>,
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
   * @param value - The entity value to insert (without _v field)
   * @param options - Insert options including ignoreIfAlreadyPresent and condition
   * @returns The inserted entity with metadata
   */
  insert(
    value: Omit<ESchemaType<TSchema>, "_v">,
    options?: {
      ignoreIfAlreadyPresent?: boolean;
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, DynamodbError> {
    const self = this;
    return Effect.gen(function* () {
      const fullValue = {
        ...value,
        _v: self.#eschema.latestVersion,
      } as ESchemaType<TSchema>;
      const encoded = yield* self.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => DynamodbError.putItemFailed(e)));

      const _u = generateUlid();

      const meta: MetaType = {
        _e: self.#eschema.name,
        _v: self.#eschema.latestVersion,
        _u,
        _i: 0,
        _d: false,
      };

      const valueWithMeta = { ...fullValue, _u };
      const primaryIndex = self.#derivePrimaryIndex(valueWithMeta);
      const indexMap = self.#deriveSecondaryIndexes(valueWithMeta);

      const item = {
        ...encoded,
        ...meta,
        [self.#table.primary.pk]: primaryIndex.pk,
        [self.#table.primary.sk]: primaryIndex.sk,
        ...indexMap,
      };

      const exprResult = buildExpr({
        condition: exprCondition(($) =>
          $.and(
            ...([
              options?.condition,
              $.attributeNotExists(self.#table.primary.pk as any),
              $.attributeNotExists(self.#table.primary.sk as any),
            ].filter(Boolean) as ConditionOperation[]),
          ),
        ),
      });

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
            IndexSkValue<ESchemaType<TSchema>, TPrimarySkKeys>,
        );
        if (!existing) {
          return yield* Effect.fail(
            DynamodbError.getItemFailed("Item not found after insert conflict"),
          );
        }
        return existing;
      }

      return { value: fullValue, meta };
    });
  }

  /**
   * Updates an existing entity by its primary key.
   *
   * @param keyValue - Object containing the primary key field values
   * @param updates - Partial entity with fields to update
   * @param options - Update options including meta for optimistic locking and condition
   * @returns The updated entity with new metadata
   */
  update(
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      IndexSkValue<ESchemaType<TSchema>, TPrimarySkKeys>,
    updates: Partial<Omit<ESchemaType<TSchema>, "_v">>,
    options?: {
      meta?: Partial<MetaType>;
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, DynamodbError> {
    const self = this;
    return Effect.gen(function* () {
      const pk = deriveIndexKeyValue(
        self.#eschema.name,
        self.#primaryDerivation.pkDeps,
        keyValue as Record<string, unknown>,
        true,
      );
      const sk = deriveIndexKeyValue(
        self.#eschema.name,
        self.#primaryDerivation.skDeps,
        keyValue as Record<string, unknown>,
        false,
      );

      const _u = generateUlid();
      const updatesWithMeta = { ...updates, _u };
      const indexMap = self.#deriveSecondaryIndexes(updatesWithMeta);

      const conditionOps: ConditionOperation[] = [
        exprCondition(($) =>
          $.cond("_v" as any, "=", self.#eschema.latestVersion),
        ),
      ];
      if (options?.condition) conditionOps.push(options.condition);
      if (options?.meta?._i !== undefined) {
        conditionOps.push(
          exprCondition(($) => $.cond("_i" as any, "=", options.meta!._i)),
        );
      }

      const condition = exprCondition(($) => $.and(...conditionOps));

      const update = exprUpdate<any>(($) => [
        ...Object.entries({ ...updates, ...indexMap }).map(([key, v]) =>
          $.set(key, v),
        ),
        $.set("_i", $.opAdd("_i", 1)),
        $.set("_u", _u),
      ]);

      const exprResult = buildExpr({
        update,
        condition,
      });

      const result = yield* self.#table
        .updateItem({ pk, sk }, { ReturnValues: "ALL_NEW", ...exprResult })
        .pipe(
          Effect.mapError((e): DynamodbError =>
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

      return {
        value: decodedValue as ESchemaType<TSchema>,
        meta: updatedMeta,
      };
    });
  }

  /**
   * Creates an insert operation for use in a transaction.
   *
   * @param value - The entity value to insert
   * @param options - Insert options including condition
   * @returns A transaction item for insert
   */
  insertOp(
    value: Omit<ESchemaType<TSchema>, "_v">,
    options?: {
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<TransactItem<TSchema["name"]>, DynamodbError> {
    return Effect.gen(this, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as ESchemaType<TSchema>;
      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => DynamodbError.putItemFailed(e)));

      const _u = generateUlid();

      const meta: MetaType = {
        _e: this.#eschema.name,
        _v: this.#eschema.latestVersion,
        _u,
        _i: 0,
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

      const exprResult = buildExpr({
        condition: exprCondition(($) =>
          $.and(
            ...([
              options?.condition,
              $.attributeNotExists(this.#table.primary.pk as any),
              $.attributeNotExists(this.#table.primary.sk as any),
            ].filter(Boolean) as ConditionOperation[]),
          ),
        ),
      });

      const tableOp = this.#table.opPutItem(item, exprResult);
      return {
        ...tableOp,
        entityName: this.#eschema.name,
      };
    });
  }

  /**
   * Creates an update operation for use in a transaction.
   *
   * @param keyValue - Object containing the primary key field values
   * @param updates - Partial entity with fields to update
   * @param options - Update options including meta for optimistic locking and condition
   * @returns A transaction item for update
   */
  updateOp(
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      IndexSkValue<ESchemaType<TSchema>, TPrimarySkKeys>,
    updates: Partial<Omit<ESchemaType<TSchema>, "_v">>,
    options?: {
      meta?: Partial<MetaType>;
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<TransactItem<TSchema["name"]>, DynamodbError> {
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

      const _u = generateUlid();
      const updatesWithMeta = { ...updates, _u };
      const indexMap = this.#deriveSecondaryIndexes(updatesWithMeta);

      const conditionOps: ConditionOperation[] = [
        exprCondition(($) =>
          $.cond("_v" as any, "=", this.#eschema.latestVersion),
        ),
      ];
      if (options?.condition) conditionOps.push(options.condition);
      if (options?.meta?._i !== undefined) {
        conditionOps.push(
          exprCondition(($) => $.cond("_i" as any, "=", options.meta!._i)),
        );
      }

      const condition = exprCondition(($) => $.and(...conditionOps));

      const update = exprUpdate<any>(($) => [
        ...Object.entries({ ...updates, ...indexMap }).map(([key, v]) =>
          $.set(key, v),
        ),
        $.set("_i", $.opAdd("_i", 1)),
        $.set("_u", _u),
      ]);

      const exprResult = buildExpr({
        update,
        condition,
      });

      const tableOp = this.#table.opUpdateItem({ pk, sk }, exprResult);
      return {
        ...tableOp,
        entityName: this.#eschema.name,
      };
    });
  }

  /**
   * Queries entities using the primary index.
   *
   * @param params - Query parameters with pk value and optional sk condition
   * @param options - Query options including limit, sort order, and filter
   * @returns Array of matching entities with metadata
   */
  query(
    params: {
      pk: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>;
      sk?: SortKeyparameter<IndexSkValue<ESchemaType<TSchema>, TPrimarySkKeys>>;
    },
    options?: {
      Limit?: number;
      ScanIndexForward?: boolean;
      filter?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<
    { items: EntityType<ESchemaType<TSchema>>[] },
    DynamodbError
  > {
    return Effect.gen(this, function* () {
      const derivedPk = deriveIndexKeyValue(
        this.#eschema.name,
        this.#primaryDerivation.pkDeps,
        params.pk as Record<string, unknown>,
        true,
      );
      const derivedSk = params.sk
        ? this.#calculatePrimarySk(params.sk as any)
        : undefined;

      const { Items } = yield* this.#table.query(
        { pk: derivedPk, sk: derivedSk as any },
        options,
      );

      const items = yield* Effect.all(
        Items.map((item) =>
          this.#eschema.decode(item).pipe(
            Effect.map((value) => ({
              value: value as ESchemaType<TSchema>,
              meta: Schema.decodeUnknownSync(metaSchema)(item),
            })),
            Effect.mapError((e) => DynamodbError.queryFailed(e)),
          ),
        ),
      );

      return { items };
    });
  }

  /**
   * Accesses a secondary index by its entity-level name.
   *
   * @typeParam EntityIndexName - The name of the secondary index
   * @param entityIndexName - The semantic index name defined for this entity
   * @returns An object with query methods for the index
   *
   * @example
   * ```ts
   * entity.index("byEmail").query({ pk: { email: "test@example.com" } });
   * ```
   */
  index<EntityIndexName extends keyof TSecondaryDerivationMap>(
    entityIndexName: EntityIndexName,
  ) {
    const self = this;
    return {
      /**
       * Queries entities using the secondary index.
       */
      query: (
        params: {
          pk: Record<
            TSecondaryDerivationMap[EntityIndexName]["pkDeps"][number],
            unknown
          >;
          sk?: SortKeyparameter<
            Record<
              TSecondaryDerivationMap[EntityIndexName]["skDeps"][number],
              unknown
            >
          >;
        },
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
          const indexDerivation = self.#secondaryDerivations[entityIndexName];

          if (!indexDerivation) {
            throw new Error(`Index ${String(entityIndexName)} not found`);
          }

          const derivedPk = deriveIndexKeyValue(
            indexDerivation.entityIndexName,
            indexDerivation.pkDeps,
            params.pk as Record<string, unknown>,
            true,
          );
          const derivedSk = params.sk
            ? self.#calculateGsiSk(indexDerivation, params.sk as any)
            : undefined;

          const { Items } = yield* self.#table
            .index(indexDerivation.gsiName as any)
            .query({ pk: derivedPk, sk: derivedSk as any }, options);

          const items = yield* Effect.all(
            Items.map((item) =>
              self.#eschema.decode(item).pipe(
                Effect.map((value) => ({
                  value: value as ESchemaType<TSchema>,
                  meta: Schema.decodeUnknownSync(metaSchema)(item),
                })),
                Effect.mapError((e) => DynamodbError.queryFailed(e)),
              ),
            ),
          );

          return { items };
        });
      },
    };
  }

  #calculatePrimarySk(sk: SortKeyparameter): SortKeyparameter | string {
    const realSk = toDiscriminatedGeneric(sk as Record<string, any>);
    const entityName = this.#eschema.name;
    const skDeps = this.#primaryDerivation.skDeps;

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

  #calculateGsiSk(
    deriv: StoredIndexDerivation,
    sk: SortKeyparameter,
  ): SortKeyparameter | string {
    const realSk = toDiscriminatedGeneric(sk as Record<string, any>);
    const entityName = this.#eschema.name;
    const skDeps = deriv.skDeps;

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

      if (deriv.pkDeps.every((key: string) => typeof value[key] !== "undefined")) {
        const pkKey = `${deriv.gsiName}PK`;
        indexMap[pkKey] = deriveIndexKeyValue(
          deriv.entityIndexName,
          deriv.pkDeps,
          value,
          true,
        );
      }

      if (deriv.skDeps.every((key: string) => typeof value[key] !== "undefined")) {
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
}

/**
 * Builder class for configuring entity index derivations.
 */
class EntityIndexDerivations<
  TTable extends DynamoTableInstance,
  TSchema extends AnyESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
  TPrimarySkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
> {
  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: { pk: readonly (keyof ESchemaType<TSchema>)[]; sk: readonly (keyof ESchemaType<TSchema>)[] };
  #secondaryDerivations: TSecondaryDerivationMap;

  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: { pk: readonly (keyof ESchemaType<TSchema>)[]; sk: readonly (keyof ESchemaType<TSchema>)[] },
    definitions: TSecondaryDerivationMap,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = definitions;
  }

  /**
   * Maps a table GSI to a semantic entity index with custom derivation.
   *
   * @typeParam GsiName - The GSI name on the table
   * @typeParam TPkKeys - Fields used for partition key derivation
   * @typeParam TSkKeys - Fields used for sort key derivation
   * @param gsiName - The GSI name on the table (e.g., "GSI1")
   * @param entityIndexName - The semantic name for this entity's use of the GSI (e.g., "byEmail")
   * @param derivation - The pk and sk field arrays
   * @returns A builder with the index mapping added
   */
  index<
    GsiName extends keyof TTable["secondaryIndexMap"] & string,
    const TPkKeys extends readonly (keyof ESchemaType<TSchema> | DerivableMetaFields)[],
    const TSkKeys extends readonly (keyof ESchemaType<TSchema> | DerivableMetaFields)[],
  >(
    gsiName: GsiName,
    entityIndexName: string,
    derivation: {
      pk: TPkKeys;
      sk: TSkKeys;
    },
  ) {
    const newDeriv: StoredIndexDerivation = {
      gsiName,
      entityIndexName,
      pkDeps: derivation.pk.map(String),
      skDeps: derivation.sk.map(String),
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
      TPrimarySkKeys,
      TSecondaryDerivationMap &
        Record<
          typeof entityIndexName,
          StoredIndexDerivation & {
            pkDeps: TPkKeys;
            skDeps: TSkKeys;
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

    return new DynamoEntity<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys,
      TPrimarySkKeys
    >(
      this.#table,
      this.#eschema,
      storedPrimary,
      this.#secondaryDerivations,
    );
  }
}
