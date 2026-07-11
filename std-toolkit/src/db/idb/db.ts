import { Context, Effect } from 'effect';
import { IdbDBError } from './errors.js';

export { IdbDBError, type IdbDBErrorCode } from './errors.js';

/**
 * The stored IndexedDB row — a native structured-clone object. Unlike the
 * SQLite adapter, `_data` is a real object, not a JSON string.
 */
export interface IdbRecord {
  pk: string;
  sk: string;
  _data: Record<string, unknown>;
  _e: string;
  _v: string;
  _u: string;
  _d: boolean;
  [gsiKeyField: string]: unknown;
}

export interface IdbKey {
  pk: string;
  sk: string;
}

/**
 * A range over one item collection (a fixed `pk`), expressed as bounds on
 * `sk`. `lower`/`upper` are inclusive unless the matching `*Open` flag is
 * set. Omitting both bounds selects the whole item collection.
 */
export interface IdbRangeSpec {
  pk: string;
  lower?: string;
  upper?: string;
  lowerOpen?: boolean;
  upperOpen?: boolean;
}

/**
 * expectedU semantics (checked inside the transaction, per key):
 *   undefined -> unconditional write
 *   null      -> record must NOT exist (insert)
 *   string    -> stored record's _u must equal it (optimistic update)
 * Any violation aborts the whole transaction with IdbDBError.conditionFailed
 * and NO ops are applied.
 */
export type IdbWriteOp =
  | { type: 'put'; record: IdbRecord; expectedU?: string | null }
  | {
      type: 'patch';
      key: IdbKey;
      values: Record<string, unknown>;
      expectedU?: string;
    }
  | { type: 'delete'; key: IdbKey };

/**
 * Low-level IndexedDB database service. One object store per logical table,
 * `keyPath: ['pk', 'sk']`. See `src/db/idb/CONTEXT.md` and the ADR at
 * `src/db/idb/docs/adr/0001-buffered-transactions-and-auto-versioning.md`
 * for why `setup` auto-versions and `transact` buffers ops into one native
 * IndexedDB transaction instead of exposing begin/commit/rollback.
 */
export class IdbDB extends Context.Service<
  IdbDB,
  {
    /** The logical table name this connection is bound to (= the object store name). */
    readonly tableName: string;

    /**
     * Diffs `secondaryIndexes` against what exists on the object store and
     * bumps the database version only when something is missing. Calling
     * this repeatedly (or on an already-complete database) is a no-op. After
     * each upgrade attempt it rechecks the topology, so concurrent callers in
     * other tabs converge even when another caller wins the requested version.
     */
    setup(
      secondaryIndexes: Record<string, { pk: string; sk: string }>,
    ): Effect.Effect<void, IdbDBError>;

    get(key: IdbKey): Effect.Effect<IdbRecord | null, IdbDBError>;

    put(record: IdbRecord): Effect.Effect<void, IdbDBError>;

    delete(key: IdbKey): Effect.Effect<void, IdbDBError>;

    clear(): Effect.Effect<{ rowsDeleted: number }, IdbDBError>;

    /**
     * Reads a range of records from one item collection, either from the
     * primary store (`index: null`) or a named secondary index. Always
     * iterates via a cursor so descending order (`direction: 'prev'`) is
     * uniform with ascending.
     */
    getRange(
      index: string | null,
      range: IdbRangeSpec,
      options?: { direction?: 'next' | 'prev'; limit?: number },
    ): Effect.Effect<IdbRecord[], IdbDBError>;

    /**
     * Applies every op in ONE native read-write IndexedDB transaction.
     * `expectedU` is re-checked inside the transaction, per key; any
     * violation aborts the whole transaction so NO ops are applied.
     */
    transact(ops: ReadonlyArray<IdbWriteOp>): Effect.Effect<void, IdbDBError>;
  }
>()('IdbDB') {}
