import type { Effect } from 'effect';
import type { OfflineStorageError } from './offline-storage-error.js';

export type OfflineStorageGroup = {
  get: <T>(key: string) => Effect.Effect<T | null, OfflineStorageError>;
  getAll: <T>() => Effect.Effect<
    Array<{ key: string; value: T }>,
    OfflineStorageError
  >;
  put: <T>(key: string, value: T) => Effect.Effect<void, OfflineStorageError>;
  putMany: <T>(
    entries: Array<{ key: string; value: T }>,
  ) => Effect.Effect<void, OfflineStorageError>;
  delete: (key: string) => Effect.Effect<void, OfflineStorageError>;
  clear: () => Effect.Effect<void, OfflineStorageError>;
};

/**
 * Self-description of a storage's backing mechanism, so devtools can address the
 * underlying store (e.g. open the IndexedDB database) without assuming what kind
 * it is. Each adapter carries its own identifying fields; consumers branch on
 * `kind`. New adapters add a variant here rather than overloading an existing one.
 */
export type StorageDescriptor =
  | { kind: 'indexeddb'; name: string }
  | { kind: 'memory' };

export type OfflineStorage = {
  /** What backs this storage, and how to address it — see {@link StorageDescriptor}. */
  readonly descriptor: StorageDescriptor;
  group: (name: string) => OfflineStorageGroup;
  clear: () => Effect.Effect<void, OfflineStorageError>;
  inspect: () => Effect.Effect<
    Array<{ group: string; entries: Array<{ key: string; value: unknown }> }>,
    OfflineStorageError
  >;
};

export type OfflineStorageSetting = OfflineStorage | false;
