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

export type OfflineStorage = {
  group: (name: string) => OfflineStorageGroup;
  clear: () => Effect.Effect<void, OfflineStorageError>;
};

export type OfflineStorageSetting = OfflineStorage | false;
