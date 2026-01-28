import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Effect, Option, Schema } from "effect";
import type { SQLiteTableInstance, SortKeyCondition } from "./SQLiteTable.js";
import { SqliteDB, SqliteDBError } from "../sql/db.js";
import { ulid } from "ulid";
import {
  deriveIndexKeyValue,
  extractKeyOp,
  getKeyOpScanDirection,
  sqlMetaSchema,
  type RawRow,
  type RowMeta,
  type SkParam,
  type SimpleQueryOptions,
  type SubscribeOptions,
  type StoredIndexDerivation,
  type StoredPrimaryDerivation,
} from "../internal/utils.js";
import type { StdDescriptor, IndexPatternDescriptor } from "@std-toolkit/core";
import { ConnectionService } from "@std-toolkit/core/server";

/**
 * Meta fields that can be used in index derivations.
 */
type DerivableMetaFields = "_uid";

/**
 * Makes the ID field optional for insert operations and accepts plain strings.
 * When not provided, a ULID will be auto-generated.
 */
type InsertInput<T, IdField extends string> = Omit<T, IdField | "_v"> & {
  [K in IdField & keyof T]?: string;
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
 * Helper type to extract all key fields from a derivation's pkDeps and skDeps.
 */
type DerivationKeyFields<TDeriv extends StoredIndexDerivation> =
  | TDeriv["pkDeps"][number]
  | TDeriv["skDeps"][number];

/**
 * Helper type to get the key value type for a given index.
 */
type IndexKeyValue<
  TSchema extends AnyESchema,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
  K extends "pk" | (keyof TSecondaryDerivationMap & string),
> = K extends "pk"
  ? Pick<ESchemaType<TSchema>, TPrimaryPkKeys | TSchema["idField"]>
  : K extends keyof TSecondaryDerivationMap
    ? Pick<
        ESchemaType<TSchema>,
        DerivationKeyFields<TSecondaryDerivationMap[K]> &
          keyof ESchemaType<TSchema>
      >
    : never;

/**
 * A SQLite entity with type-safe CRUD operations and automatic index derivation.
 * Entities are built on top of a SQLiteTable and use an ESchema for validation.
 */
export class SQLiteEntity<
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema> | DerivableMetaFields,
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
              {}
            >(table, eschema, { pk: pkKeys, sk: skKeys } as any, {});
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
  get name(): TSchema["name"] {
    return this.#eschema.name;
  }

  /**
   * Creates a branded ID for this entity from a plain string.
   * Use this to create type-safe IDs for operations that require them.
   */
  id(value: string): ReturnType<TSchema["makeId"]> {
    return this.#eschema.makeId(value) as ReturnType<TSchema["makeId"]>;
  }

  /**
   * Gets the unified descriptor for this entity including schema and index info.
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
   * The ID field is optional - if not provided, a ULID will be auto-generated.
   *
   * @param value - The entity value to insert (ID field is optional)
   * @returns The inserted entity with metadata
   */
  insert(
    value: InsertInput<ESchemaType<TSchema>, TSchema["idField"]>,
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const idField = this.#eschema.idField;
      const providedId = (value as Record<string, unknown>)[idField];
      const generatedId = providedId ?? ulid();

      const fullValue = {
        ...value,
        [idField]: this.#eschema.makeId(generatedId as string),
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

      yield* this.#table.deleteItem({ pk, sk });

      return { ...existing, meta: { ...existing.meta, _d: true } };
    });
  }

  /**
   * Queries entities using the primary index or a secondary index.
   *
   * @param key - "pk" for primary index, or the secondary index name
   * @param params - Query parameters with pk and sk
   * @param options - Query options including limit
   * @returns Array of matching entities with metadata
   */
  query<K extends "pk" | (keyof TSecondaryDerivationMap & string)>(
    key: K,
    params: K extends "pk"
      ? {
          pk: IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>;
          sk: SkParam<Pick<ESchemaType<TSchema>, TSchema["idField"]>>;
        }
      : K extends keyof TSecondaryDerivationMap
        ? {
            pk: Pick<
              ESchemaType<TSchema>,
              TSecondaryDerivationMap[K]["pkDeps"][number] &
                keyof ESchemaType<TSchema>
            >;
            sk: SkParam<
              Pick<
                ESchemaType<TSchema>,
                TSecondaryDerivationMap[K]["skDeps"][number] &
                  keyof ESchemaType<TSchema>
              >
            >;
          }
        : never,
    options?: SimpleQueryOptions,
  ): Effect.Effect<
    { items: EntityType<ESchemaType<TSchema>>[] },
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen(this, function* () {
      // Extract operator and value from sk param
      const { operator, value: skValue } = extractKeyOp(
        params.sk as SkParam<Record<string, unknown>>,
      );
      const scanForward = getKeyOpScanDirection(operator);

      if (key === "pk") {
        // Primary index query
        const derivedPk = deriveIndexKeyValue(
          this.#eschema.name,
          this.#primaryDerivation.pkDeps,
          params.pk as Record<string, unknown>,
          true,
        );

        let skCondition: SortKeyCondition | undefined;
        if (skValue !== null) {
          const derivedSk = deriveIndexKeyValue(
            this.#eschema.name,
            this.#primaryDerivation.skDeps,
            skValue as Record<string, unknown>,
            false,
          );
          skCondition = { [operator]: derivedSk } as SortKeyCondition;
        }

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
          throw new Error(`Index ${String(key)} not found`);
        }

        const derivedPk = deriveIndexKeyValue(
          indexDerivation.entityIndexName,
          indexDerivation.pkDeps,
          params.pk as Record<string, unknown>,
          true,
        );

        let skConditionSecondary: SortKeyCondition | undefined;
        if (skValue !== null) {
          const derivedSk = deriveIndexKeyValue(
            this.#eschema.name,
            indexDerivation.skDeps,
            skValue as Record<string, unknown>,
            false,
          );
          skConditionSecondary = { [operator]: derivedSk } as SortKeyCondition;
        }

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
   * Subscribes to items from the primary index or a secondary index.
   */
  subscribe<K extends "pk" | (keyof TSecondaryDerivationMap & string)>(
    opts: SubscribeOptions<
      K,
      IndexKeyValue<TSchema, TSecondaryDerivationMap, TPrimaryPkKeys, K>
    >,
  ): Effect.Effect<
    { items: EntityType<ESchemaType<TSchema>>[] },
    SqliteDBError,
    SqliteDB
  > {
    const { key, value, limit } = opts;

    if (value == null) {
      return Effect.succeed({ items: [] });
    }

    const queryOptions: SimpleQueryOptions = {};
    if (limit !== undefined) {
      queryOptions.limit = limit;
    }

    // Get pk and sk deps for this key
    const { pkDeps, skDeps } =
      key === "pk"
        ? this.#primaryDerivation
        : this.#secondaryDerivations[key as keyof TSecondaryDerivationMap]!;

    // Split cursor value into pk and sk parts
    const cursorValue = value as Record<string, unknown>;
    const pkPart: Record<string, unknown> = {};
    const skPart: Record<string, unknown> = {};

    for (const dep of pkDeps) {
      pkPart[dep] = cursorValue[dep];
    }
    for (const dep of skDeps) {
      skPart[dep] = cursorValue[dep];
    }

    return this.query(
      key,
      { pk: pkPart, sk: { ">": skPart } } as any,
      queryOptions,
    );
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
      (yield* this.#service)?.broadcast(entity);
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
            _uid: ulid(),
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
> {
  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: {
    pk: readonly (keyof ESchemaType<TSchema>)[];
    sk: readonly (keyof ESchemaType<TSchema>)[];
  };
  #secondaryDerivations: TSecondaryDerivationMap;

  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: {
      pk: readonly (keyof ESchemaType<TSchema>)[];
      sk: readonly (keyof ESchemaType<TSchema>)[];
    },
    definitions: TSecondaryDerivationMap,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = definitions;
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
    const TPkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[],
  >(
    indexName: IndexNameStr,
    entityIndexName: string,
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
          typeof entityIndexName,
          StoredIndexDerivation & {
            pkDeps: TPkKeys;
            skDeps: typeof skKeys;
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

    return new SQLiteEntity<TSecondaryDerivationMap, TSchema, TPrimaryPkKeys>(
      this.#table,
      this.#eschema,
      storedPrimary,
      this.#secondaryDerivations,
    );
  }
}
