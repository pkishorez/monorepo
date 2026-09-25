/**
 * Stores left by earlier versions: the engines' own caches from before the
 * shared downloader, and segments from its short-lived parallel version.
 * All are deleted once found; deleting a missing one does nothing.
 */
import { Effect } from 'effect';

const transformersCache = 'transformers-cache';
const parakeetDatabase = 'parakeet-cache-db';
const downloadsStore = 'stt-downloads';
const oldSegmentKeys = 'https://segments.stt.invalid/';

const deleteOldSegments = Effect.promise(async () => {
  if (!(await caches.has(downloadsStore))) return;
  const cache = await caches.open(downloadsStore);
  for (const request of await cache.keys()) {
    if (request.url.startsWith(oldSegmentKeys)) await cache.delete(request);
  }
});

const deleteDatabase = (name: string) =>
  Effect.callback<void>((resume) => {
    const request = indexedDB.deleteDatabase(name);
    const done = () => resume(Effect.void);
    request.onsuccess = done;
    request.onerror = done;
    request.onblocked = done;
  });

/** Never fails: a store that cannot be deleted is left for the next visit. */
export const deleteLegacyStores: Effect.Effect<void> = Effect.gen(function* () {
  if ('caches' in globalThis) {
    yield* Effect.promise(() => caches.delete(transformersCache));
    yield* deleteOldSegments;
  }
  if ('indexedDB' in globalThis) yield* deleteDatabase(parakeetDatabase);
}).pipe(Effect.ignore);
