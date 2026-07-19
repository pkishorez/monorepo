import { Effect, Option } from 'effect';
import { SqliteDB, SqliteDBError } from '../sql/db.js';
import * as Sql from '../sql/helpers/index.js';
import type { RawRow } from '../internal/utils.js';
import type {
  AnyEntityESchema,
  AnySingleEntityESchema,
} from '../../../eschema/index.js';
import { Broadcaster, nextUlid, type EntityType } from '../../../core/index.js';
import { SQLiteEntity, type SqliteEntityOp } from './sqlite-entity.js';
import { SQLiteSingleEntity } from './sqlite-single-entity.js';

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
  | { '<': string }
  | { '<=': string }
  | { '>': string }
  | { '>=': string }
  | { '=': string }
  | { between: [string, string] }
  | { beginsWith: string };

/**
 * Base table columns for the single-table design.
 */
const TABLE_COLUMNS = [
  Sql.column({ name: 'pk', type: 'TEXT' }),
  Sql.column({ name: 'sk', type: 'TEXT' }),
  Sql.column({ name: '_data', type: 'TEXT' }),
  Sql.column({ name: '_e', type: 'TEXT' }),
  Sql.column({ name: '_v', type: 'TEXT' }),
  Sql.column({ name: '_u', type: 'TEXT' }),
  Sql.column({ name: '_d', type: 'INTEGER', default: 0 }),
];

/**
 * Factory for creating SQLite table instances with type-safe index configuration.
 * Mirrors the DynamoDB single-table design pattern.
 */
export const SQLiteTable = {
  /**
   * Creates a new SQLite table builder.
   *
   * The table definition is pure topology (keys and indexes); the physical
   * table name is supplied separately via `betterSqlite3Layer`.
   *
   * @returns A builder to configure the primary key
   */
  make() {
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
        return new SQLiteTableBuilder({ pk, sk }, {});
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
>(primary: TPrimaryIndex, secondaryIndexMap: TSecondaryIndexMap) {
  const buildWhere = (
    pkCol: string,
    skCol: string,
    cond: KeyConditionParameters,
  ): Sql.Where => {
    if (!cond.sk) {
      return Sql.where(pkCol, '=', cond.pk);
    }

    const skCondition = cond.sk;
    if ('<' in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, '=', cond.pk),
        Sql.where(skCol, '<', skCondition['<']),
      );
    }
    if ('<=' in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, '=', cond.pk),
        Sql.where(skCol, '<=', skCondition['<=']),
      );
    }
    if ('>' in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, '=', cond.pk),
        Sql.where(skCol, '>', skCondition['>']),
      );
    }
    if ('>=' in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, '=', cond.pk),
        Sql.where(skCol, '>=', skCondition['>=']),
      );
    }
    if ('=' in skCondition) {
      return Sql.whereAnd(
        Sql.where(pkCol, '=', cond.pk),
        Sql.where(skCol, '=', skCondition['=']),
      );
    }
    if ('between' in skCondition) {
      const [start, end] = skCondition.between;
      return {
        clause: `${pkCol} = ? AND ${skCol} BETWEEN ? AND ?`,
        params: [cond.pk, start, end],
      };
    }
    if ('beginsWith' in skCondition) {
      const prefix = skCondition.beginsWith;
      return {
        clause: `${pkCol} = ? AND ${skCol} LIKE ?`,
        params: [cond.pk, `${prefix}%`],
      };
    }

    return Sql.where(pkCol, '=', cond.pk);
  };

  const getSortDirection = (sk?: SortKeyCondition): 'ASC' | 'DESC' => {
    if (!sk) return 'ASC';
    if ('<' in sk || '<=' in sk) return 'DESC';
    return 'ASC';
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
          ? 'DESC'
          : options?.ScanIndexForward === true
            ? 'ASC'
            : getSortDirection(cond.sk);

      const rows = yield* db.query<RawRow>(db.tableName, whereClause, {
        orderBy: direction,
        orderByColumn: indexDef.sk,
        limit: options?.Limit ?? 100,
      });

      return { Items: rows };
    });
  };

  return {
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
            Sql.column({ name: indexDef.pk, type: 'TEXT', nullable: true }),
          );
          allColumns.push(
            Sql.column({ name: indexDef.sk, type: 'TEXT', nullable: true }),
          );
        }

        // Create table with composite primary key (no-op if table exists)
        yield* db.createTable(db.tableName, allColumns, [
          primary.pk,
          primary.sk,
        ]);

        // Add any missing secondary index columns to existing table
        for (const [, indexDef] of Object.entries(secondaryIndexMap)) {
          yield* db.addColumn(db.tableName, indexDef.pk, 'TEXT');
          yield* db.addColumn(db.tableName, indexDef.sk, 'TEXT');
        }

        // Create secondary indexes (no-op if index exists)
        for (const [indexName, indexDef] of Object.entries(secondaryIndexMap)) {
          yield* db.createIndex(
            db.tableName,
            `idx_${db.tableName}_${indexName}`,
            [indexDef.pk, indexDef.sk],
          );
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

        const rows = yield* db.query<RawRow>(db.tableName, whereClause, {
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
        yield* db.insert(db.tableName, value);
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
        yield* db.update(db.tableName, values, whereClause);
      });
    },

    /**
     * Soft-deletes an item by setting its `_d` flag.
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
        yield* db.update(db.tableName, { _d: 1 }, whereClause);
      });
    },

    /**
     * Hard-deletes rows matching a where clause.
     */
    delete(
      where: Sql.Where,
    ): Effect.Effect<{ rowsDeleted: number }, SqliteDBError, SqliteDB> {
      return Effect.gen(function* () {
        const db = yield* SqliteDB;
        return yield* db.delete(db.tableName, where);
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
     * Deletes all items from the table.
     */
    dangerouslyRemoveAllItems(
      _: 'I KNOW WHAT I AM DOING',
    ): Effect.Effect<{ itemsDeleted: number }, SqliteDBError, SqliteDB> {
      return SqliteDB.pipe(
        Effect.flatMap((db) => db.deleteAll(db.tableName)),
        Effect.map(({ rowsDeleted }) => ({ itemsDeleted: rowsDeleted })),
      );
    },
  };
}

/**
 * Wraps the base table with entity definition and transaction capabilities.
 * Entities built from the returned table register themselves into it; duplicate
 * entity names fail at build time.
 */
function withEntityDefinitions<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
>(base: SQLiteTableInstance<TPrimaryIndex, TSecondaryIndexMap>) {
  const entityNames = new Set<string>();
  const register = (entity: { name: string }) => {
    if (entityNames.has(entity.name)) {
      throw new Error(
        `Entity "${entity.name}" is already defined on this table`,
      );
    }
    entityNames.add(entity.name);
  };

  return {
    ...base,

    /**
     * Defines a keyed entity on this table from an ESchema.
     * The entity is registered into the table when `.build()` is called.
     *
     * @param eschema - The entity's ESchema
     * @returns A builder to configure the primary index derivation
     */
    entity<TS extends AnyEntityESchema>(eschema: TS) {
      return SQLiteEntity.make(base, register).eschema(eschema);
    },

    /**
     * Defines a singleton entity on this table from an ESchema.
     * The entity is registered into the table when `.default()` is called.
     *
     * @param eschema - The single entity's ESchema
     * @returns A builder to set the default value
     */
    singleEntity<TS extends AnySingleEntityESchema>(eschema: TS) {
      return SQLiteSingleEntity.make(base, register).eschema(eschema);
    },

    /**
     * Applies every op inside ONE database transaction, or none do — see the
     * buffered-transact ADR in `src/db/docs/adr`. Ops are built ahead of time
     * via each entity's `insertOp`/`updateOp`/`deleteOp`/`restoreOp`, outside
     * any transaction; the transaction re-checks each op's condition
     * (`insert`: row must not exist; `update`: stored `_u` must equal
     * `expectedU` unless the op opted into `lastWriteWins`) and any violation
     * rolls everything back with `conditionFailed`. Ops built against a
     * different table are rejected as a defect.
     *
     * Broadcasts fire only after the transaction commits, in op order; a
     * failed transaction broadcasts nothing.
     *
     * @param ops - Pre-built op descriptors from this table's entities
     * @returns The written entities, in op order
     */
    transact(
      ops: ReadonlyArray<SqliteEntityOp>,
    ): Effect.Effect<EntityType<unknown>[], SqliteDBError, SqliteDB> {
      return Effect.gen(function* () {
        if (ops.length === 0) return [];

        for (const op of ops) {
          if (op.table !== base) {
            return yield* Effect.die(
              new Error(
                `Transaction op for entity "${op.entityName}" was built against a different table`,
              ),
            );
          }
        }

        const keyCounts = new Map<
          string,
          { count: number; pk: string; sk: string }
        >();
        for (const op of ops) {
          const key = JSON.stringify([op.pk, op.sk]);
          const existing = keyCounts.get(key);
          keyCounts.set(key, {
            count: (existing?.count ?? 0) + 1,
            pk: op.pk,
            sk: op.sk,
          });
        }
        for (const { count, pk, sk } of keyCounts.values()) {
          if (count > 1) {
            return yield* Effect.die(
              new Error(
                `transact requires unique items; ${count} ops target pk=${pk} sk=${sk}`,
              ),
            );
          }
        }

        const db = yield* SqliteDB;

        const applyOp = (op: SqliteEntityOp) =>
          Effect.gen(function* () {
            const { write, entity } = op.apply(yield* nextUlid);
            const keyWhere = Sql.wherePkSkExact(
              base.primary.pk,
              base.primary.sk,
              write.key.pk,
              write.key.sk,
            );

            if (write.type === 'insert') {
              yield* db.insert(db.tableName, write.values).pipe(
                Effect.catch((error) =>
                  Effect.gen(function* () {
                    const rows = yield* db
                      .query<RawRow>(db.tableName, keyWhere, { limit: 1 })
                      .pipe(Effect.catch(() => Effect.succeed([])));
                    return yield* Effect.fail(
                      rows.length > 0
                        ? SqliteDBError.conditionFailed(db.tableName, write.key)
                        : error,
                    );
                  }),
                ),
              );
              return entity;
            }

            yield* db
              .update(
                db.tableName,
                write.values,
                write.expectedU === undefined
                  ? keyWhere
                  : Sql.whereAnd(
                      keyWhere,
                      Sql.where('_u', '=', write.expectedU),
                    ),
              )
              .pipe(
                Effect.flatMap(({ rowsWritten }) =>
                  rowsWritten === 0
                    ? Effect.fail(
                        SqliteDBError.conditionFailed(db.tableName, write.key),
                      )
                    : Effect.void,
                ),
              );
            return entity;
          });

        const transaction = yield* Effect.acquireUseRelease(
          db.begin().pipe(Effect.as({ committed: false })),
          (state) =>
            Effect.gen(function* () {
              const writes = yield* Effect.forEach(ops, applyOp);
              yield* Effect.uninterruptible(
                db.commit().pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      state.committed = true;
                    }),
                  ),
                ),
              );
              return writes;
            }),
          (state) =>
            state.committed ? Effect.void : db.rollback().pipe(Effect.ignore),
        );

        const connectionService = yield* Effect.serviceOption(Broadcaster).pipe(
          Effect.map(Option.getOrNull),
        );
        connectionService?.broadcast(transaction);
        return transaction;
      });
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
  #primary: TPrimaryIndex;
  #secondaryIndexMap: TSecondaryIndexMap;

  constructor(primary: TPrimaryIndex, secondaryIndexMap: TSecondaryIndexMap) {
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
    >(this.#primary, {
      ...this.#secondaryIndexMap,
      [name]: { pk, sk },
    } as TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>);
  }

  /**
   * Builds the final SQLiteTable instance with all configured indexes.
   *
   * @returns The configured table with entity definition capabilities
   */
  build() {
    return withEntityDefinitions(
      createSQLiteTableInstance(this.#primary, this.#secondaryIndexMap),
    );
  }
}
