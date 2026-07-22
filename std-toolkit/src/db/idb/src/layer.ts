import type { IDBPDatabase, IDBPIndex, IDBPObjectStore } from 'idb';
import { openDB } from 'idb';
import { Effect, Layer } from 'effect';
import { IdbDB, IdbDBError } from './db.js';
import type { IdbKey, IdbRangeSpec, IdbRecord, IdbWriteOp } from './db.js';

type Store = IDBPObjectStore<unknown, ArrayLike<string>, string, 'readwrite'>;

// Readable source for `getRange`: either the primary store or a named
// secondary index, both opened read-only.
type RangeSource =
  | IDBPObjectStore<unknown, ArrayLike<string>, string, 'readonly'>
  | IDBPIndex<unknown, ArrayLike<string>, string, string, 'readonly'>;

// Module-level connection cache, keyed by database name — a database name
// given to `idbLayer` belongs exclusively to this adapter (see the ADR).
const connections = new Map<string, IDBPDatabase>();
const pendingOpens = new Map<string, Promise<IDBPDatabase>>();

const forgetConnection = (dbName: string, db: IDBPDatabase): void => {
  db.close();
  if (connections.get(dbName) === db) connections.delete(dbName);
};

// `close` fires on abnormal closure (storage cleared, browser-forced close);
// without evicting there, the dead connection would be served forever.
const rememberConnection = (dbName: string, db: IDBPDatabase): IDBPDatabase => {
  db.addEventListener('versionchange', () => forgetConnection(dbName, db));
  db.addEventListener('close', () => forgetConnection(dbName, db));
  connections.set(dbName, db);
  return db;
};

const requireIndexedDb = (): void => {
  if (!globalThis.indexedDB) {
    throw IdbDBError.openFailed(
      new Error('IndexedDB is not available in this environment'),
    );
  }
};

const hasErrorName = (cause: unknown, name: string): boolean =>
  typeof cause === 'object' &&
  cause !== null &&
  'name' in cause &&
  cause.name === name;

// Only the first executed Effect touches `globalThis.indexedDB` — `idbLayer`
// itself stays callable during module evaluation / SSR. Concurrent callers
// share one in-flight open so the cache never holds an orphaned connection.
const acquireDb = (dbName: string): Promise<IDBPDatabase> => {
  const cached = connections.get(dbName);
  if (cached) return Promise.resolve(cached);
  const pending = pendingOpens.get(dbName);
  if (pending) return pending;
  const opening = (async () => {
    requireIndexedDb();
    try {
      return rememberConnection(dbName, await openDB(dbName));
    } catch (cause) {
      throw cause instanceof IdbDBError ? cause : IdbDBError.openFailed(cause);
    } finally {
      pendingOpens.delete(dbName);
    }
  })();
  pendingOpens.set(dbName, opening);
  return opening;
};

const existingIndexNames = async (
  db: IDBPDatabase,
  tableName: string,
): Promise<Set<string>> => {
  if (!db.objectStoreNames.contains(tableName)) return new Set();
  const tx = db.transaction(tableName, 'readonly');
  const names = new Set<string>(tx.objectStore(tableName).indexNames);
  await tx.done;
  return names;
};

const runSetup = async (
  dbName: string,
  tableName: string,
  secondaryIndexes: Record<string, { pk: string; sk: string }>,
): Promise<void> => {
  while (true) {
    const db = await acquireDb(dbName);
    const hasStore = db.objectStoreNames.contains(tableName);
    let existing: Set<string>;
    try {
      existing = await existingIndexNames(db, tableName);
    } catch (cause) {
      // The connection died under us (e.g. closed by another tab's upgrade);
      // evict it so the retry opens a fresh one instead of looping on the
      // same dead connection.
      if (hasErrorName(cause, 'InvalidStateError')) {
        forgetConnection(dbName, db);
        continue;
      }
      throw cause;
    }
    const missingIndexNames = Object.keys(secondaryIndexes).filter(
      (name) => !existing.has(name),
    );

    if (hasStore && missingIndexNames.length === 0) return;

    const nextVersion = db.version + 1;
    forgetConnection(dbName, db);

    try {
      const upgraded = await openDB(dbName, nextVersion, {
        upgrade(database, _oldVersion, _newVersion, transaction) {
          const store = database.objectStoreNames.contains(tableName)
            ? transaction.objectStore(tableName)
            : database.createObjectStore(tableName, {
                keyPath: ['pk', 'sk'],
              });
          for (const [indexName, def] of Object.entries(secondaryIndexes)) {
            if (!store.indexNames.contains(indexName)) {
              store.createIndex(indexName, [def.pk, def.sk]);
            }
          }
        },
      });
      rememberConnection(dbName, upgraded);
    } catch (cause) {
      if (hasErrorName(cause, 'VersionError')) continue;
      throw IdbDBError.openFailed(cause);
    }
  }
};

const preserveDbError = (
  cause: unknown,
  fallback: (cause: unknown) => IdbDBError,
): IdbDBError => (cause instanceof IdbDBError ? cause : fallback(cause));

const checkExpectedU = (
  existing: IdbRecord | undefined,
  expectedU: string | null,
): boolean =>
  expectedU === null
    ? existing === undefined
    : existing !== undefined && existing._u === expectedU;

const applyOp = async (
  store: Store,
  tableName: string,
  op: IdbWriteOp,
): Promise<void> => {
  if (op.type === 'put') {
    if (op.expectedU !== undefined) {
      const existing = (await store.get([op.record.pk, op.record.sk])) as
        | IdbRecord
        | undefined;
      if (!checkExpectedU(existing, op.expectedU)) {
        store.transaction.abort();
        throw IdbDBError.conditionFailed(tableName, {
          pk: op.record.pk,
          sk: op.record.sk,
        });
      }
    }
    await store.put(op.record);
    return;
  }

  if (op.type === 'patch') {
    const existing = (await store.get([op.key.pk, op.key.sk])) as
      | IdbRecord
      | undefined;
    if (
      existing === undefined ||
      (op.expectedU !== undefined && existing._u !== op.expectedU)
    ) {
      store.transaction.abort();
      throw IdbDBError.conditionFailed(tableName, op.key);
    }
    await store.put({ ...existing, ...op.values });
    return;
  }

  await store.delete([op.key.pk, op.key.sk]);
};

const runTransact = async (
  dbName: string,
  tableName: string,
  ops: ReadonlyArray<IdbWriteOp>,
): Promise<void> => {
  const db = await acquireDb(dbName);
  const tx = db.transaction(tableName, 'readwrite');
  // `tx.done` rejects when a condition failure aborts the transaction; the
  // real error is thrown from applyOp itself, so swallow this expected
  // rejection here rather than let it surface as an unhandled rejection.
  tx.done.catch(() => {});
  const store = tx.store as Store;

  for (const op of ops) {
    await applyOp(store, tableName, op);
  }

  await tx.done;
};

// `[]` as the upper sentinel means "every possible sk under this pk" —
// arrays sort after all strings in IndexedDB key ordering.
const buildKeyRange = (range: IdbRangeSpec): IDBKeyRange =>
  IDBKeyRange.bound(
    [range.pk, range.lower ?? ''],
    [range.pk, range.upper ?? []],
    range.lowerOpen ?? false,
    range.upperOpen ?? false,
  );

const runGetRange = async (
  dbName: string,
  tableName: string,
  index: string | null,
  range: IdbRangeSpec,
  options?: { direction?: 'next' | 'prev'; limit?: number },
): Promise<IdbRecord[]> => {
  const db = await acquireDb(dbName);
  const tx = db.transaction(tableName, 'readonly');
  const source: RangeSource = index === null ? tx.store : tx.store.index(index);
  const keyRange = buildKeyRange(range);
  const direction = options?.direction ?? 'next';
  const limit = options?.limit;

  const results: IdbRecord[] = [];
  let cursor = await source.openCursor(keyRange, direction);
  while (cursor !== null) {
    if (limit !== undefined && results.length >= limit) break;
    results.push(cursor.value as IdbRecord);
    cursor = await cursor.continue();
  }

  await tx.done;
  return results;
};

/** Constructs the browser IndexedDB layer for {@link IdbDB}. */
export const idbLayer = (
  dbName: string,
  tableName: string,
): Layer.Layer<IdbDB> =>
  Layer.succeed(IdbDB, {
    tableName,

    setup: (secondaryIndexes) =>
      Effect.tryPromise({
        try: () => runSetup(dbName, tableName, secondaryIndexes),
        catch: (cause) =>
          preserveDbError(cause, (error) =>
            IdbDBError.setupFailed(tableName, error),
          ),
      }),

    get: (key: IdbKey) =>
      Effect.tryPromise({
        try: async () => {
          const db = await acquireDb(dbName);
          const record = await db.get(tableName, [key.pk, key.sk]);
          return (record as IdbRecord | undefined) ?? null;
        },
        catch: (cause) =>
          preserveDbError(cause, (error) =>
            IdbDBError.getFailed(tableName, error),
          ),
      }),

    put: (record: IdbRecord) =>
      Effect.tryPromise({
        try: async () => {
          const db = await acquireDb(dbName);
          await db.put(tableName, record);
        },
        catch: (cause) =>
          preserveDbError(cause, (error) =>
            IdbDBError.putFailed(tableName, error),
          ),
      }),

    delete: (key: IdbKey) =>
      Effect.tryPromise({
        try: async () => {
          const db = await acquireDb(dbName);
          await db.delete(tableName, [key.pk, key.sk]);
        },
        catch: (cause) =>
          preserveDbError(cause, (error) =>
            IdbDBError.deleteFailed(tableName, error),
          ),
      }),

    clear: () =>
      Effect.tryPromise({
        try: async () => {
          const db = await acquireDb(dbName);
          const tx = db.transaction(tableName, 'readwrite');
          const rowsDeleted = await tx.store.count();
          await tx.store.clear();
          await tx.done;
          return { rowsDeleted };
        },
        catch: (cause) =>
          preserveDbError(cause, (error) =>
            IdbDBError.clearFailed(tableName, error),
          ),
      }),

    transact: (ops: ReadonlyArray<IdbWriteOp>) =>
      Effect.tryPromise({
        try: () => runTransact(dbName, tableName, ops),
        catch: (cause) =>
          preserveDbError(cause, (error) =>
            IdbDBError.transactFailed(tableName, error),
          ),
      }),

    getRange: (
      index: string | null,
      range: IdbRangeSpec,
      options?: { direction?: 'next' | 'prev'; limit?: number },
    ) =>
      Effect.tryPromise({
        try: () => runGetRange(dbName, tableName, index, range, options),
        catch: (cause) =>
          preserveDbError(cause, (error) =>
            IdbDBError.getFailed(tableName, error),
          ),
      }),
  });
