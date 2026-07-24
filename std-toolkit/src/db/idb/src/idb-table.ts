import { Effect, Option } from 'effect';
import { IdbDB, IdbDBError } from './db.js';
import type { IdbKey, IdbRangeSpec, IdbRecord } from './db.js';
import type {
  AnyEntityESchema,
  AnySingleEntityESchema,
} from '../../../eschema/index.js';
import { Broadcaster, nextUlid, type EntityType } from '../../../core/index.js';
import { IdbEntity, type IdbEntityOp } from './idb-entity.js';
import { IdbSingleEntity } from './idb-single-entity.js';
import type { TableSnapshot } from '../../../snapshot/index.js';
import {
  createEntityRegistry,
  createTableSnapshot,
} from '../../../snapshot/internal/table-snapshot.js';

/**
 * Defines the structure of a primary or secondary index.
 */
export interface IndexDefinition {
  /** Partition key field name */
  pk: string;
  /** Sort key field name */
  sk: string;
}

/**
 * Result of a query operation.
 */
export interface QueryResult {
  /** Array of records returned by the query */
  Items: IdbRecord[];
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
 * Factory for creating IndexedDB table instances with type-safe index
 * configuration. Mirrors `SQLiteTable`'s single-table design.
 */
export const IdbTable = {
  /**
   * Creates a new IndexedDB table builder.
   *
   * The table definition is pure topology (keys and indexes); the physical
   * object store name is supplied separately via `idbLayer`.
   *
   * @returns A builder to configure the primary key
   */
  make() {
    return {
      /**
       * Defines the primary key structure for the table.
       *
       * @typeParam Pk - The partition key field name
       * @typeParam Sk - The sort key field name
       * @param pk - Partition key field name
       * @param sk - Sort key field name
       * @returns A builder to add secondary indexes
       */
      primary<Pk extends string, Sk extends string>(pk: Pk, sk: Sk) {
        return new IdbTableBuilder({ pk, sk }, {});
      },
    };
  },
};

/**
 * Translates a `SortKeyCondition` into the `IdbRangeSpec` bounds `getRange`
 * understands. `between` and `beginsWith` are both inclusive-inclusive,
 * matching `SQLiteTable`'s SQL `BETWEEN`/`LIKE` semantics.
 */
const buildRange = (cond: KeyConditionParameters): IdbRangeSpec => {
  if (!cond.sk) return { pk: cond.pk };

  const skCondition = cond.sk;
  if ('<' in skCondition) {
    return { pk: cond.pk, upper: skCondition['<'], upperOpen: true };
  }
  if ('<=' in skCondition) {
    return { pk: cond.pk, upper: skCondition['<='] };
  }
  if ('>' in skCondition) {
    return { pk: cond.pk, lower: skCondition['>'], lowerOpen: true };
  }
  if ('>=' in skCondition) {
    return { pk: cond.pk, lower: skCondition['>='] };
  }
  if ('=' in skCondition) {
    return { pk: cond.pk, lower: skCondition['='], upper: skCondition['='] };
  }
  if ('between' in skCondition) {
    const [start, end] = skCondition.between;
    return { pk: cond.pk, lower: start, upper: end };
  }
  if ('beginsWith' in skCondition) {
    const prefix = skCondition.beginsWith;
    return { pk: cond.pk, lower: prefix, upper: `${prefix}￿` };
  }

  return { pk: cond.pk };
};

const getSortDirection = (sk?: SortKeyCondition): 'next' | 'prev' => {
  if (!sk) return 'next';
  if ('<' in sk || '<=' in sk) return 'prev';
  return 'next';
};

/**
 * Creates the internal table instance with all IndexedDB operations.
 */
function createIdbTableInstance<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
>(primary: TPrimaryIndex, secondaryIndexMap: TSecondaryIndexMap) {
  const rawQuery = (
    index: string | null,
    cond: KeyConditionParameters,
    options?: {
      Limit?: number;
      ScanIndexForward?: boolean;
    },
  ): Effect.Effect<QueryResult, IdbDBError, IdbDB> => {
    return Effect.gen(function* () {
      const db = yield* IdbDB;
      const range = buildRange(cond);
      const direction =
        options?.ScanIndexForward === false
          ? 'prev'
          : options?.ScanIndexForward === true
            ? 'next'
            : getSortDirection(cond.sk);

      const items = yield* db.getRange(index, range, {
        direction,
        limit: options?.Limit ?? 100,
      });

      return { Items: items };
    });
  };

  return {
    /** The primary index definition */
    primary,
    /** Map of secondary index names to their definitions */
    secondaryIndexMap,

    /**
     * Sets up the table by creating its object store and any missing
     * secondary indexes.
     */
    setup(): Effect.Effect<void, IdbDBError, IdbDB> {
      return IdbDB.pipe(Effect.flatMap((db) => db.setup(secondaryIndexMap)));
    },

    /**
     * Retrieves a single item by its primary key.
     *
     * @param key - The primary key values (pk and sk)
     * @returns The item if found, or null
     */
    getItem(
      key: IdbKey,
    ): Effect.Effect<{ Item: IdbRecord | null }, IdbDBError, IdbDB> {
      return Effect.gen(function* () {
        const db = yield* IdbDB;
        const record = yield* db.get(key);
        return { Item: record };
      });
    },

    /**
     * Creates or replaces an item in the table.
     *
     * @param record - The record to put (must include pk and sk)
     * @returns Effect that completes when the item is stored
     */
    putItem(record: IdbRecord): Effect.Effect<void, IdbDBError, IdbDB> {
      return IdbDB.pipe(Effect.flatMap((db) => db.put(record)));
    },

    /**
     * Updates attributes of an existing item.
     *
     * @param key - The primary key of the item to update
     * @param values - The values to merge into the record
     * @param expectedU - Optional optimistic concurrency value
     * @returns Effect that completes when the update is done
     */
    updateItem(
      key: IdbKey,
      values: Record<string, unknown>,
      expectedU?: string,
    ): Effect.Effect<void, IdbDBError, IdbDB> {
      return IdbDB.pipe(
        Effect.flatMap((db) =>
          db.transact([
            expectedU === undefined
              ? { type: 'patch', key, values }
              : { type: 'patch', key, values, expectedU },
          ]),
        ),
      );
    },

    /**
     * Soft-deletes an item by patching `_d: true`, leaving the record readable
     * (and syncable as a tombstone) via `getItem`.
     *
     * @param key - The primary key of the item to delete
     */
    deleteItem(key: IdbKey): Effect.Effect<void, IdbDBError, IdbDB> {
      return IdbDB.pipe(
        Effect.flatMap((db) =>
          db.transact([{ type: 'patch', key, values: { _d: true } }]),
        ),
      );
    },

    /**
     * Permanently removes an item from the table.
     *
     * @param key - The primary key of the item to delete
     */
    hardDeleteItem(key: IdbKey): Effect.Effect<void, IdbDBError, IdbDB> {
      return IdbDB.pipe(Effect.flatMap((db) => db.delete(key)));
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
    ): Effect.Effect<QueryResult, IdbDBError, IdbDB> {
      return rawQuery(null, cond, options);
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
        ): Effect.Effect<QueryResult, IdbDBError, IdbDB> {
          return rawQuery(indexName as string, cond, options);
        },
      };
    },

    /**
     * Deletes all items from the table.
     */
    dangerouslyRemoveAllItems(
      _: 'I KNOW WHAT I AM DOING',
    ): Effect.Effect<{ itemsDeleted: number }, IdbDBError, IdbDB> {
      return IdbDB.pipe(
        Effect.flatMap((db) => db.clear()),
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
>(base: IdbTableInstance<TPrimaryIndex, TSecondaryIndexMap>) {
  const { register, snapshotSources } = createEntityRegistry();

  return {
    ...base,

    /** Returns the normalized logical storage contract for this table. */
    snapshot(): TableSnapshot {
      return createTableSnapshot({
        adapter: 'idb',
        primaryIndex: base.primary,
        secondaryIndexes: Object.entries(base.secondaryIndexMap).map(
          ([name, index]) => ({
            name,
            kind: 'sparse',
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
      return IdbEntity.make(base, register).eschema(eschema);
    },

    /**
     * Defines a singleton entity on this table from an ESchema.
     * The entity is registered into the table when `.default()` is called.
     *
     * @param eschema - The single entity's ESchema
     * @returns A builder to set the default value
     */
    singleEntity<TS extends AnySingleEntityESchema>(eschema: TS) {
      return IdbSingleEntity.make(base, register).eschema(eschema);
    },

    /**
     * Applies every op in ONE native IndexedDB read-write transaction, or
     * none do — see the buffered-transactions ADR. Ops are built ahead of
     * time via each entity's `insertOp`/`updateOp`, outside any transaction.
     * Ops built against a different table are rejected as a defect.
     *
     * Broadcasts fire only after the underlying transaction commits, in op
     * order; a failed transaction broadcasts nothing.
     *
     * @param ops - Pre-built op descriptors from this table's entities
     * @returns The written entities, in op order
     */
    transact(
      ops: ReadonlyArray<IdbEntityOp>,
    ): Effect.Effect<EntityType<unknown>[], IdbDBError, IdbDB> {
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

        const db = yield* IdbDB;
        const applied = yield* Effect.forEach(ops, (op) =>
          Effect.map(nextUlid, op.apply),
        );
        yield* db.transact(applied.map((a) => a.write));

        const connectionService = yield* Effect.serviceOption(Broadcaster).pipe(
          Effect.map(Option.getOrNull),
        );
        const entities = applied.map((a) => a.entity);
        connectionService?.broadcast(entities);
        return entities;
      }).pipe(
        Effect.withSpan('idb.table.transact', {
          attributes: { operationCount: ops.length },
        }),
      );
    },
  };
}

/**
 * Type representing an instance of IdbTable with configured indexes.
 */
export type IdbTableInstance<
  TPrimaryIndex extends IndexDefinition = IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition> = Record<
    string,
    IndexDefinition
  >,
> = ReturnType<
  typeof createIdbTableInstance<TPrimaryIndex, TSecondaryIndexMap>
>;

/**
 * Builder class for configuring IndexedDB table indexes.
 */
class IdbTableBuilder<
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
   * @typeParam Pk - The partition key field name for the index
   * @typeParam Sk - The sort key field name for the index
   * @param name - The index name
   * @param pk - The partition key field name
   * @param sk - The sort key field name
   * @returns A builder with the index added
   */
  index<IndexName extends string, Pk extends string, Sk extends string>(
    name: IndexName,
    pk: Pk,
    sk: Sk,
  ) {
    return new IdbTableBuilder<
      TPrimaryIndex,
      TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>
    >(this.#primary, {
      ...this.#secondaryIndexMap,
      [name]: { pk, sk },
    } as TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>);
  }

  /**
   * Builds the final IdbTable instance with all configured indexes.
   *
   * @returns The configured table with entity definition capabilities
   */
  build() {
    return withEntityDefinitions(
      createIdbTableInstance(this.#primary, this.#secondaryIndexMap),
    );
  }
}
