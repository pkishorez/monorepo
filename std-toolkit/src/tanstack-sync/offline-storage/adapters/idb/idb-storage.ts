import { Effect } from 'effect';
import { offlineStorageError } from '../../offline-storage-error.js';
import type { OfflineStorage, OfflineStorageGroup } from '../../types.js';
import {
  ENTRY_STORE,
  GROUP_INDEX,
  acquireDatabase,
  type DataVersion,
  type StoredEntry,
} from './internals.js';

export type IdbStorageOptions = {
  name: string;
  version?: DataVersion;
};

// Factory-time validation is pure: it never touches `indexedDB`, so an
// `idbStorage` handle can be constructed during SSR/module-eval (where no
// IndexedDB exists). The presence check is deferred to `acquireDatabase`, which
// only runs inside the async storage operations — all client-side.
const validateOptions = (options: IdbStorageOptions): DataVersion => {
  if (options.name.length === 0) {
    throw new Error('IndexedDB storage name must not be empty');
  }
  const version = options.version ?? 1;
  if (typeof version === 'number') {
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(
        'IndexedDB storage version must be a positive integer or non-empty string',
      );
    }
    return version;
  }
  if (version.length === 0) {
    throw new Error(
      'IndexedDB storage version must be a positive integer or non-empty string',
    );
  }
  return version;
};

const clone = <T>(value: T): T => structuredClone(value);

export const idbStorage = (options: IdbStorageOptions): OfflineStorage => {
  const dataVersion = validateOptions(options);

  const db = () => acquireDatabase(options.name, dataVersion);

  const makeGroup = (group: string): OfflineStorageGroup => ({
    get: <T>(key: string) =>
      Effect.tryPromise({
        try: async () => {
          const entry = (await (await db()).get(ENTRY_STORE, [group, key])) as
            | StoredEntry
            | undefined;
          return entry ? (entry.value as T) : null;
        },
        catch: (cause) => offlineStorageError('get', cause),
      }),
    getAll: <T>() =>
      Effect.tryPromise({
        try: async () => {
          const database = await db();
          const entries = (await database.getAllFromIndex(
            ENTRY_STORE,
            GROUP_INDEX,
            group,
          )) as StoredEntry[];
          return entries.map((entry) => ({
            key: entry.key,
            value: entry.value as T,
          }));
        },
        catch: (cause) => offlineStorageError('getAll', cause),
      }),
    put: <T>(key: string, value: T) =>
      Effect.tryPromise({
        try: async () => {
          const valueClone = clone(value);
          await (
            await db()
          ).put(ENTRY_STORE, { group, key, value: valueClone });
        },
        catch: (cause) => offlineStorageError('put', cause),
      }).pipe(Effect.asVoid),
    putMany: <T>(entries: Array<{ key: string; value: T }>) =>
      Effect.tryPromise({
        try: async () => {
          const storedEntries = entries.map(({ key, value }) => ({
            group,
            key,
            value: clone(value),
          }));
          if (storedEntries.length === 0) return;
          const tx = (await db()).transaction(ENTRY_STORE, 'readwrite');
          await Promise.all(storedEntries.map((entry) => tx.store.put(entry)));
          await tx.done;
        },
        catch: (cause) => offlineStorageError('putMany', cause),
      }),
    delete: (key: string) =>
      Effect.tryPromise({
        try: async () => {
          await (await db()).delete(ENTRY_STORE, [group, key]);
        },
        catch: (cause) => offlineStorageError('delete', cause),
      }).pipe(Effect.asVoid),
    clear: () =>
      Effect.tryPromise({
        try: async () => {
          const tx = (await db()).transaction(ENTRY_STORE, 'readwrite');
          let cursor = await tx.store.index(GROUP_INDEX).openCursor(group);
          while (cursor) {
            await cursor.delete();
            cursor = await cursor.continue();
          }
          await tx.done;
        },
        catch: (cause) => offlineStorageError('clear', cause),
      }),
  });

  return {
    descriptor: { kind: 'indexeddb', name: options.name },
    group: makeGroup,
    inspect: () =>
      Effect.tryPromise({
        try: async () => {
          const tx = (await db()).transaction(ENTRY_STORE, 'readonly');
          const grouped = new Map<
            string,
            Array<{ key: string; value: unknown }>
          >();
          let cursor = await tx.store.index(GROUP_INDEX).openCursor();
          while (cursor) {
            const entry = cursor.value as StoredEntry;
            const entries = grouped.get(entry.group) ?? [];
            entries.push({ key: entry.key, value: entry.value });
            grouped.set(entry.group, entries);
            cursor = await cursor.continue();
          }
          await tx.done;
          return Array.from(grouped, ([group, entries]) => ({
            group,
            entries,
          }));
        },
        catch: (cause) => offlineStorageError('getAll', cause),
      }),
    clear: () =>
      Effect.tryPromise({
        try: async () => {
          await (await db()).clear(ENTRY_STORE);
        },
        catch: (cause) => offlineStorageError('clear', cause),
      }).pipe(Effect.asVoid),
  };
};
