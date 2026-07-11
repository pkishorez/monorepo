import { useState } from 'react';
import { Effect, Stream } from 'effect';
import { useMutation } from '@tanstack/react-query';
import { useComponentLifecycle } from 'use-effect-ts';
import { useTanStackSyncDevtools } from '../internal/context';

const ENTRY_STORE = 'entries';
const BATCH_SIZE = 200;

type DbContents = { count: number; bytes: number };
type Batch = DbContents & { next: IDBValidKey | null };

type Meta = {
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
};

const readEstimate = async (): Promise<{
  usage: number | null;
  quota: number | null;
}> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: null, quota: null };
  }
  const { usage, quota } = await navigator.storage.estimate();
  return { usage: usage ?? null, quota: quota ?? null };
};

const readPersisted = async (): Promise<boolean | null> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return null;
  }
  return navigator.storage.persisted();
};

const requestPersistence = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  return navigator.storage.persist();
};

const openDb = (name: string): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const open = indexedDB.open(name);
    open.onerror = () => resolve(null);
    open.onsuccess = () => resolve(open.result);
  });

const measureBatch = (
  store: IDBObjectStore,
  range: IDBKeyRange | null,
): Promise<Batch> =>
  new Promise((resolve, reject) => {
    let count = 0;
    let bytes = 0;
    const request = store.openCursor(range);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve({ count, bytes, next: null });
      bytes += new Blob([JSON.stringify(cursor.value)]).size;
      count += 1;
      if (count >= BATCH_SIZE)
        return resolve({ count, bytes, next: cursor.key });
      cursor.continue();
    };
  });

// Walks the entries store in cursor batches, yielding the running accumulation
// after each one. Each batch is a fresh short readonly transaction resuming just
// after the previous batch's last key; awaiting between batches keeps the main
// thread responsive on a large DB.
async function* measureBatches(db: IDBDatabase): AsyncGenerator<DbContents> {
  if (!db.objectStoreNames.contains(ENTRY_STORE)) {
    yield { count: 0, bytes: 0 };
    return;
  }
  let count = 0;
  let bytes = 0;
  let from: IDBValidKey | null = null;
  for (;;) {
    const range = from == null ? null : IDBKeyRange.lowerBound(from, true);
    const tx = db.transaction(ENTRY_STORE, 'readonly');
    const batch = await measureBatch(tx.objectStore(ENTRY_STORE), range);
    count += batch.count;
    bytes += batch.bytes;
    yield { count, bytes };
    if (batch.next == null) return;
    from = batch.next;
  }
}

// The accumulation as an Effect Stream — interrupting the fiber tears the cursor
// walk down with it.
const measureStream = (db: IDBDatabase): Stream.Stream<DbContents, unknown> =>
  Stream.fromAsyncIterable(measureBatches(db), (error) => error);

const REFRESH_EVERY = '4 seconds';

export function useIdbStats(active: boolean) {
  const { inspector, runPromise } = useTanStackSyncDevtools();
  const { descriptor } = inspector.storage;
  const dbName = descriptor.kind === 'indexeddb' ? descriptor.name : null;
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<DbContents | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  // The streamed measurement runs for the panel's lifetime: scan the DB, then
  // re-scan on an interval so it stays live without an IndexedDB change event.
  // The first pass streams its accumulation into view (with the loading
  // indicator); later passes update atomically so they don't flicker back to
  // zero. Changing `nonce` (manual refresh / after a mutation) restarts it; the
  // fiber is interrupted on unmount.
  useComponentLifecycle(
    Effect.gen(function* () {
      if (!active) return;
      let first = true;
      for (;;) {
        const [estimate, persisted] = yield* Effect.all(
          [Effect.promise(readEstimate), Effect.promise(readPersisted)],
          { concurrency: 'unbounded' },
        );
        yield* Effect.sync(() =>
          setMeta({
            usageBytes: estimate.usage,
            quotaBytes: estimate.quota,
            persisted,
          }),
        );

        const db =
          dbName == null ? null : yield* Effect.promise(() => openDb(dbName));
        if (db) {
          if (first) {
            yield* Effect.sync(() => {
              setLoading(true);
              setProgress({ count: 0, bytes: 0 });
            });
            yield* Stream.runForEach(measureStream(db), (acc) =>
              Effect.sync(() => setProgress(acc)),
            );
            yield* Effect.sync(() => setLoading(false));
          } else {
            let last: DbContents = { count: 0, bytes: 0 };
            yield* Stream.runForEach(measureStream(db), (acc) =>
              Effect.sync(() => {
                last = acc;
              }),
            );
            yield* Effect.sync(() => setProgress(last));
          }
          yield* Effect.sync(() => db.close());
        }

        first = false;
        yield* Effect.sleep(REFRESH_EVERY);
      }
    }).pipe(Effect.ensuring(Effect.sync(() => setLoading(false)))),
    { deps: [active, nonce, dbName] },
  );

  const refresh = () => setNonce((n) => n + 1);

  const persist = useMutation({
    mutationFn: requestPersistence,
    onSuccess: refresh,
  });

  const clear = useMutation({
    mutationFn: () => runPromise(inspector.storage.clear()),
    onSuccess: refresh,
  });

  return {
    dbName,
    persistent: dbName != null,
    dbBytes: progress?.bytes ?? null,
    itemCount: progress?.count ?? null,
    usageBytes: meta?.usageBytes ?? null,
    quotaBytes: meta?.quotaBytes ?? null,
    persisted: meta?.persisted ?? null,
    loading,
    refresh,
    persist,
    clear,
  };
}
