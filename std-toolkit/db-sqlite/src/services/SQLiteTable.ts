import { Effect } from "effect";
import { SqliteDB, SqliteDBError } from "../sql/db.js";
import * as Sql from "../sql/helpers/index.js";
import type { RawRow } from "../internal/utils.js";

/**
 * Configuration for creating a SQLite table.
 */
export interface SQLiteTableConfig {
  /** The name of the table */
  tableName: string;
}

/**
 * Defines the structure of a primary or secondary index.
 */
export interface IndexDefinition {
  /** Partition key column name */
  pk: string;
  /** Sort key column name */
  sk: string;
}

/**
 * Result of a query operation.
 */
export interface QueryResult {
  /** Array of raw rows returned by the query */
  Items: RawRow[];
}

/**
 * Key condition parameters for queries.
 */
export interface KeyConditionParameters {
  /** The partition key value */
  pk: string;
  /** Optional sort key condition */
  sk?: SortKeyCondition;
}

/**
 * Sort key condition for queries.
 */
export type SortKeyCondition =
  | { "<": string }
  | { "<=": string }
  | { ">": string }
  | { ">=": string }
  | { "=": string }
  | { between: [string, string] }
  | { beginsWith: string };

/**
 * Base table columns for the single-table design.
 */
const TABLE_COLUMNS = [
  Sql.column({ name: "pk", type: "TEXT" }),
  Sql.column({ name: "sk", type: "TEXT" }),
  Sql.column({ name: "_data", type: "TEXT" }),
  Sql.column({ name: "_e", type: "TEXT" }),
  Sql.column({ name: "_v", type: "TEXT" }),
  Sql.column({ name: "_i", type: "INTEGER", default: 0 }),
  Sql.column({ name: "_u", type: "TEXT", default: Sql.ISO_NOW }),
  Sql.column({ name: "_c", type: "TEXT", default: Sql.ISO_NOW }),
  Sql.column({ name: "_d", type: "INTEGER", default: 0 }),
];

/**
 * Factory for creating SQLite table instances with type-safe index configuration.
 * Mirrors the DynamoDB single-table design pattern.
 */
export const SQLiteTable = {
  /**
   * Creates a new SQLite table builder with the given configuration.
   *
   * @param config - The table configuration
   * @returns A builder to configure the primary key
   */
  make(config: SQLiteTableConfig) {
    return {
      /**
       * Defines the primary key structure for the table.
       *
       * @typeParam Pk - The partition key column name
       * @typeParam Sk - The sort key column name
       * @param pk - Partition key column name
       * @param sk - Sort key column name
       * @returns A builder to add secondary indexes
       */
      primary<Pk extends string, Sk extends string>(pk: Pk, sk: Sk) {
        return new SQLiteTableBuilder(config, { pk, sk }, {});
      },
    };
  },
};

/**
 * Creates the internal table instance with all SQLite operations.
 */
function createSQLiteTableInstance<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
>(
  config: SQLiteTableConfig,
  primary: TPrimaryIndex,
  secondaryIndexMap: TSecondaryIndexMap,
) {
  const tableName = config.tableName;

  /**
   * Builds WHERE clause from key condition parameters.
   */
  const buildWhere = (
    pkCol: string,
    skCol: string,
    cond: KeyConditionParameters,
  ): Sql.Where => {
    if (!cond.sk) {
      return Sql.where(pkCol, "=", cond.pk);
    }

    const skCondition = cond.sk;
    if ("<" in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, "=", cond.pk),
        Sql.where(skCol, "<", skCondition["<"]),
      );
    }
    if ("<=" in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, "=", cond.pk),
        Sql.where(skCol, "<=", skCondition["<="]),
      );
    }
    if (">" in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, "=", cond.pk),
        Sql.where(skCol, ">", skCondition[">"]),
      );
    }
    if (">=" in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, "=", cond.pk),
        Sql.where(skCol, ">=", skCondition[">="]),
      );
    }
    if ("=" in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, "=", cond.pk),
        Sql.where(skCol, "=", skCondition["="]),
      );
    }
    if ("between" in skCondition) {
      const [start, end] = skCondition.between;
      return {
        clause: `${pkCol} = ? AND ${skCol} BETWEEN ? AND ?`,
        params: [cond.pk, start, end],
      };
    }
    if ("beginsWith" in skCondition) {
      const prefix = skCondition.beginsWith;
      return {
        clause: `${pkCol} = ? AND ${skCol} LIKE ?`,
        params: [cond.pk, `${prefix}%`],
      };
    }

    return Sql.where(pkCol, "=", cond.pk);
  };

  /**
   * Gets the sort direction based on the sk condition.
   */
  const getSortDirection = (sk?: SortKeyCondition): "ASC" | "DESC" => {
    if (!sk) return "ASC";
    if ("<" in sk || "<=" in sk) return "DESC";
    return "ASC";
  };

  const rawQuery = (
    indexDef: IndexDefinition,
    cond: KeyConditionParameters,
    options?: {
      Limit?: number;
      ScanIndexForward?: boolean;
    },
  ): Effect.Effect<QueryResult, SqliteDBError, SqliteDB> => {
    return Effect.gen(function* () {
      const db = yield* SqliteDB;
      const whereClause = buildWhere(indexDef.pk, indexDef.sk, cond);
      const direction =
        options?.ScanIndexForward === false
          ? "DESC"
          : options?.ScanIndexForward === true
            ? "ASC"
            : getSortDirection(cond.sk);

      const rows = yield* db.query<RawRow>(tableName, whereClause, {
        orderBy: direction,
        orderByColumn: indexDef.sk,
        limit: options?.Limit ?? 100,
      });

      return { Items: rows };
    });
  };

  return {
    /** The name of the SQLite table */
    tableName,
    /** The primary index definition */
    primary,
    /** Map of secondary index names to their definitions */
    secondaryIndexMap,

    /**
     * Sets up the table by creating it with all columns and indexes.
     */
    setup(): Effect.Effect<void, SqliteDBError, SqliteDB> {
      return Effect.gen(function* () {
        const db = yield* SqliteDB;

        // Build columns including secondary index columns
        const allColumns = [...TABLE_COLUMNS];
        for (const [, indexDef] of Object.entries(secondaryIndexMap)) {
          allColumns.push(
            Sql.column({ name: indexDef.pk, type: "TEXT", nullable: true }),
          );
          allColumns.push(
            Sql.column({ name: indexDef.sk, type: "TEXT", nullable: true }),
          );
        }

        // Create table with composite primary key
        yield* db.createTable(tableName, allColumns, [primary.pk, primary.sk]);

        // Create secondary indexes
        for (const [indexName, indexDef] of Object.entries(secondaryIndexMap)) {
          yield* db.createIndex(tableName, `idx_${tableName}_${indexName}`, [
            indexDef.pk,
            indexDef.sk,
          ]);
        }
      });
    },

    /**
     * Retrieves a single item by its primary key.
     *
     * @param key - The primary key values (pk and sk)
     * @returns The item if found, or null
     */
    getItem(
      key: IndexDefinition,
    ): Effect.Effect<{ Item: RawRow | null }, SqliteDBError, SqliteDB> {
      return Effect.gen(function* () {
        const db = yield* SqliteDB;
        const whereClause = Sql.wherePkSkExact(
          primary.pk,
          primary.sk,
          key.pk,
          key.sk,
        );

        const rows = yield* db.query<RawRow>(tableName, whereClause, {
          limit: 1,
        });

        return { Item: rows.length > 0 ? rows[0]! : null };
      });
    },

    /**
     * Creates or replaces an item in the table.
     *
     * @param value - The item to put (must include pk and sk)
     * @returns Effect that completes when the item is stored
     */
    putItem(
      value: Record<string, unknown>,
    ): Effect.Effect<void, SqliteDBError, SqliteDB> {
      return Effect.gen(function* () {
        const db = yield* SqliteDB;
        yield* db.insert(tableName, value);
      });
    },

    /**
     * Updates attributes of an existing item.
     *
     * @param key - The primary key of the item to update
     * @param values - The values to update
     * @returns Effect that completes when the update is done
     */
    updateItem(
      key: IndexDefinition,
      values: Record<string, unknown>,
    ): Effect.Effect<void, SqliteDBError, SqliteDB> {
      return Effect.gen(function* () {
        const db = yield* SqliteDB;
        const whereClause = Sql.wherePkSkExact(
          primary.pk,
          primary.sk,
          key.pk,
          key.sk,
        );
        yield* db.update(tableName, values, whereClause);
      });
    },

    /**
     * Deletes an item from the table (hard delete).
     *
     * @param key - The primary key of the item to delete
     */
    deleteItem(
      key: IndexDefinition,
    ): Effect.Effect<void, SqliteDBError, SqliteDB> {
      return Effect.gen(function* () {
        const db = yield* SqliteDB;
        const whereClause = Sql.wherePkSkExact(
          primary.pk,
          primary.sk,
          key.pk,
          key.sk,
        );
        // Use soft delete by updating _d flag
        yield* db.update(tableName, { _d: 1 }, whereClause);
      });
    },

    /**
     * Queries items using the primary index.
     *
     * @param cond - Key condition parameters
     * @param options - Query options including limit and sort order
     * @returns The query result with items
     */
    query(
      cond: KeyConditionParameters,
      options?: {
        Limit?: number;
        ScanIndexForward?: boolean;
      },
    ): Effect.Effect<QueryResult, SqliteDBError, SqliteDB> {
      return rawQuery(primary, cond, options);
    },

    /**
     * Accesses a secondary index for querying.
     *
     * @typeParam IndexName - The name of the secondary index
     * @param indexName - The secondary index name
     * @returns An object with query methods for the index
     */
    index<IndexName extends keyof TSecondaryIndexMap>(indexName: IndexName) {
      const indexDef = secondaryIndexMap[indexName as string];
      if (!indexDef) {
        throw new Error(`Index ${String(indexName)} not found`);
      }
      return {
        /**
         * Queries items using the secondary index.
         */
        query(
          cond: KeyConditionParameters,
          options?: {
            Limit?: number;
            ScanIndexForward?: boolean;
          },
        ): Effect.Effect<QueryResult, SqliteDBError, SqliteDB> {
          return rawQuery(indexDef, cond, options);
        },
      };
    },

    /**
     * Deletes all rows from the table.
     */
    dangerouslyRemoveAllRows(
      _: "i know what i am doing",
    ): Effect.Effect<{ rowsDeleted: number }, SqliteDBError, SqliteDB> {
      return SqliteDB.pipe(Effect.flatMap((db) => db.deleteAll(tableName)));
    },
  };
}

/**
 * Type representing an instance of SQLiteTable with configured indexes.
 */
export type SQLiteTableInstance<
  TPrimaryIndex extends IndexDefinition = IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition> = Record<
    string,
    IndexDefinition
  >,
> = ReturnType<
  typeof createSQLiteTableInstance<TPrimaryIndex, TSecondaryIndexMap>
>;

/**
 * Builder class for configuring SQLite table indexes.
 */
class SQLiteTableBuilder<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> {
  #config: SQLiteTableConfig;
  #primary: TPrimaryIndex;
  #secondaryIndexMap: TSecondaryIndexMap;

  constructor(
    config: SQLiteTableConfig,
    primary: TPrimaryIndex,
    secondaryIndexMap: TSecondaryIndexMap,
  ) {
    this.#config = config;
    this.#primary = primary;
    this.#secondaryIndexMap = secondaryIndexMap;
  }

  /**
   * Adds a secondary index to the table.
   *
   * @typeParam IndexName - The name for the index
   * @typeParam Pk - The partition key column name for the index
   * @typeParam Sk - The sort key column name for the index
   * @param name - The index name
   * @param pk - The partition key column name
   * @param sk - The sort key column name
   * @returns A builder with the index added
   */
  index<IndexName extends string, Pk extends string, Sk extends string>(
    name: IndexName,
    pk: Pk,
    sk: Sk,
  ) {
    return new SQLiteTableBuilder<
      TPrimaryIndex,
      TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>
    >(this.#config, this.#primary, {
      ...this.#secondaryIndexMap,
      [name]: { pk, sk },
    } as TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>);
  }

  /**
   * Builds the final SQLiteTable instance with all configured indexes.
   *
   * @returns The configured SQLiteTableInstance
   */
  build(): SQLiteTableInstance<TPrimaryIndex, TSecondaryIndexMap> {
    return createSQLiteTableInstance(
      this.#config,
      this.#primary,
      this.#secondaryIndexMap,
    );
  }
}
