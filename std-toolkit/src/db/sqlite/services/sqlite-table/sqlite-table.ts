import { Effect, Option } from 'effect';
import { SQLiteDatabase } from '../sqlite-database/index.js';
import { SQLiteError } from '../../domain/sqlite-error/index.js';
import { SQL as Sql, type Where } from '../../domain/sql-statement/index.js';
import type { RawRow } from '../../domain/entity-persistence/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../../eschema/index.js';
import {
  Broadcaster,
  nextUlid,
  type EntityType,
} from '../../../../core/index.js';
import {
  makeSQLiteEntity,
  type SqliteEntityOp,
} from '../sqlite-entity/index.js';
import { makeSQLiteSingleEntity } from '../sqlite-single-entity/index.js';
import type { TableSnapshot } from '../../../../snapshot/index.js';
import { createTableSnapshot } from '../../../../snapshot/capture/table-capture/index.js';
import { createTableEntityRegistry } from '../../../../snapshot/capture/table-entity-registry/index.js';

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
   * The table definition owns its physical SQLite table name.
   *
   * @returns A builder to configure the primary key
   */
  make(tableName: string) {
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
        return new SQLiteTableBuilder(tableName, { pk, sk }, {});
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
  tableName: string,
  primary: TPrimaryIndex,
  secondaryIndexMap: TSecondaryIndexMap,
) {
  const buildWhere = (
    pkCol: string,
    skCol: string,
    cond: KeyConditionParameters,
  ): Where => {
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
        clause: `${pkCol} = ? AND substr(${skCol}, 1, length(?)) = ?`,
        params: [cond.pk, prefix, prefix],
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
  ): Effect.Effect<QueryResult, SQLiteError, SQLiteDatabase> => {
    return Effect.gen(function* () {
      const db = yield* SQLiteDatabase;
      const whereClause = buildWhere(indexDef.pk, indexDef.sk, cond);
      const direction =
        options?.ScanIndexForward === false
          ? 'DESC'
          : options?.ScanIndexForward === true
            ? 'ASC'
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
    tableName,
    /** The primary index definition */
    primary,
    /** Map of secondary index names to their definitions */
    secondaryIndexMap,

    /**
     * Sets up the table by creating it with all columns and indexes.
     */
    setup(): Effect.Effect<void, SQLiteError, SQLiteDatabase> {
      return Effect.gen(function* () {
        const db = yield* SQLiteDatabase;

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
        yield* db.createTable(tableName, allColumns, [primary.pk, primary.sk]);

        // Add any missing secondary index columns to existing table
        for (const [, indexDef] of Object.entries(secondaryIndexMap)) {
          yield* db.addColumn(tableName, indexDef.pk, 'TEXT');
          yield* db.addColumn(tableName, indexDef.sk, 'TEXT');
        }

        // Create secondary indexes (no-op if index exists)
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
    ): Effect.Effect<{ Item: RawRow | null }, SQLiteError, SQLiteDatabase> {
      return Effect.gen(function* () {
        const db = yield* SQLiteDatabase;
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
    ): Effect.Effect<void, SQLiteError, SQLiteDatabase> {
      return Effect.gen(function* () {
        const db = yield* SQLiteDatabase;
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
    ): Effect.Effect<void, SQLiteError, SQLiteDatabase> {
      return Effect.gen(function* () {
        const db = yield* SQLiteDatabase;
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
     * Soft-deletes an item by setting its `_d` flag.
     *
     * @param key - The primary key of the item to delete
     */
    deleteItem(
      key: IndexDefinition,
    ): Effect.Effect<void, SQLiteError, SQLiteDatabase> {
      return Effect.gen(function* () {
        const db = yield* SQLiteDatabase;
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
     * Hard-deletes rows matching a where clause.
     */
    delete(
      where: Where,
    ): Effect.Effect<{ rowsDeleted: number }, SQLiteError, SQLiteDatabase> {
      return Effect.gen(function* () {
        const db = yield* SQLiteDatabase;
        return yield* db.delete(tableName, where);
      });
    },

    dangerouslyRemoveEntityItems(
      entityName: string,
      _: 'I KNOW WHAT I AM DOING',
    ): Effect.Effect<{ itemsDeleted: number }, SQLiteError, SQLiteDatabase> {
      return SQLiteDatabase.pipe(
        Effect.flatMap((db) =>
          db.delete(tableName, Sql.where('_e', '=', entityName)),
        ),
        Effect.map(({ rowsDeleted }) => ({ itemsDeleted: rowsDeleted })),
      );
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
    ): Effect.Effect<QueryResult, SQLiteError, SQLiteDatabase> {
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
        ): Effect.Effect<QueryResult, SQLiteError, SQLiteDatabase> {
          return rawQuery(indexDef, cond, options);
        },
      };
    },

    /**
     * Deletes all items from the table.
     */
    dangerouslyRemoveAllItems(
      _: 'I KNOW WHAT I AM DOING',
    ): Effect.Effect<{ itemsDeleted: number }, SQLiteError, SQLiteDatabase> {
      return SQLiteDatabase.pipe(
        Effect.flatMap((db) => db.deleteAll(tableName)),
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
  const { register, snapshotSources } = createTableEntityRegistry();

  return {
    ...base,

    /** Returns the normalized storage contract for this table. */
    snapshot(): TableSnapshot {
      return createTableSnapshot({
        adapter: 'sqlite',
        primaryIndex: base.primary,
        secondaryIndexes: Object.entries(base.secondaryIndexMap).map(
          ([name, index]) => ({
            name,
            kind: 'secondary',
            pk: index.pk,
            sk: index.sk,
          }),
        ),
        entities: snapshotSources(),
      });
    },

    /**
     * Defines a keyed entity on this table from an ESchema.
     * The entity is registered into the table when `.build()` is called.
     *
     * @param eschema - The entity's ESchema
     * @returns A builder to configure the primary index derivation
     */
    entity<TS extends AnyEntityESchema>(eschema: TS) {
      return makeSQLiteEntity(base, register).eschema(eschema);
    },

    /**
     * Defines a singleton entity on this table from an ESchema.
     * The entity is registered into the table when `.default()` is called.
     *
     * @param eschema - The single entity's ESchema
     * @returns A builder to set the default value
     */
    singleEntity<TS extends AnyUnkeyedESchema>(eschema: TS) {
      return makeSQLiteSingleEntity(base, register).eschema(eschema);
    },

    /**
     * Applies every op inside ONE database transaction, or none do — see the
     * buffered-transact ADR in `src/db/docs/adr`. Ops are built ahead of time
     * via each entity's `insertOp`/`updateOp`/`deleteOp`/`restoreOp`, outside
     * any transaction; the transaction re-checks each op's condition
     * (`insert`: row must not exist; `update`: stored `_u` must equal
     * `expectedU` unless the op opted into `lastWriteWins`) and any violation
     * rolls everything back with `conditionFailed`. Ops built against a
     * different table are rejected with a typed persistence error.
     *
     * Broadcasts fire only after the transaction commits, in op order; a
     * failed transaction broadcasts nothing.
     *
     * @param ops - Pre-built op descriptors from this table's entities
     * @returns The written entities, in op order
     */
    transact(
      ops: ReadonlyArray<SqliteEntityOp>,
    ): Effect.Effect<EntityType<unknown>[], SQLiteError, SQLiteDatabase> {
      return Effect.gen(function* () {
        if (ops.length === 0) return [];

        for (const op of ops) {
          if (op.table !== base) {
            return yield* Effect.fail(
              SQLiteError.foreignTransactionItem(op.entityName, {
                tableName: base.tableName,
                partitionKey: op.pk,
                sortKey: op.sk,
                operationKind: op.operationKind,
              }),
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
            return yield* Effect.fail(
              SQLiteError.duplicateTransactionTarget(pk, sk, {
                tableName: base.tableName,
              }),
            );
          }
        }

        const db = yield* SQLiteDatabase;

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
              yield* db.insert(base.tableName, write.values).pipe(
                Effect.catch((error) =>
                  Effect.gen(function* () {
                    const rows = yield* db
                      .query<RawRow>(base.tableName, keyWhere, { limit: 1 })
                      .pipe(Effect.catch(() => Effect.succeed([])));
                    return yield* Effect.fail(
                      rows.length > 0
                        ? SQLiteError.conditionFailed(base.tableName, write.key)
                        : error,
                    );
                  }),
                ),
              );
              return entity;
            }

            yield* db
              .update(
                base.tableName,
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
                        SQLiteError.conditionFailed(base.tableName, write.key),
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
      }).pipe(
        Effect.withSpan('sqlite.table.transact', {
          attributes: { operationCount: ops.length },
        }),
      );
    },
  };
}

export type SQLiteTableService<
  TPrimaryIndex extends IndexDefinition = IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition> = Record<
    string,
    IndexDefinition
  >,
> = ReturnType<typeof withEntityDefinitions<TPrimaryIndex, TSecondaryIndexMap>>;

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
  #tableName: string;
  #primary: TPrimaryIndex;
  #secondaryIndexMap: TSecondaryIndexMap;

  constructor(
    tableName: string,
    primary: TPrimaryIndex,
    secondaryIndexMap: TSecondaryIndexMap,
  ) {
    this.#tableName = tableName;
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
    >(this.#tableName, this.#primary, {
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
      createSQLiteTableInstance(
        this.#tableName,
        this.#primary,
        this.#secondaryIndexMap,
      ),
    );
  }
}
