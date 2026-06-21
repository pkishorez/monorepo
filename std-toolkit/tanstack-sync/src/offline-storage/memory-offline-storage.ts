import { Effect } from 'effect';
import { offlineStorageError } from './offline-storage-error.js';
import type { OfflineStorage, OfflineStorageGroup } from './types.js';

const clone = <T>(value: T): T => structuredClone(value);

export const memoryOfflineStorage = (): OfflineStorage => {
  const groups = new Map<string, Map<string, unknown>>();

  const getGroup = (name: string): Map<string, unknown> => {
    let group = groups.get(name);
    if (!group) {
      group = new Map();
      groups.set(name, group);
    }
    return group;
  };

  const makeGroup = (name: string): OfflineStorageGroup => ({
    get: <T>(key: string) =>
      Effect.try({
        try: () => {
          const value = getGroup(name).get(key);
          return value === undefined ? null : clone(value as T);
        },
        catch: (cause) => offlineStorageError('get', cause),
      }),
    getAll: <T>() =>
      Effect.try({
        try: () =>
          Array.from(getGroup(name), ([key, value]) => ({
            key,
            value: clone(value as T),
          })),
        catch: (cause) => offlineStorageError('getAll', cause),
      }),
    put: <T>(key: string, value: T) =>
      Effect.try({
        try: () => {
          getGroup(name).set(key, clone(value));
        },
        catch: (cause) => offlineStorageError('put', cause),
      }),
    putMany: <T>(entries: Array<{ key: string; value: T }>) =>
      Effect.try({
        try: () => {
          const cloned = entries.map(({ key, value }) => ({
            key,
            value: clone(value),
          }));
          const group = getGroup(name);
          for (const { key, value } of cloned) {
            group.set(key, value);
          }
        },
        catch: (cause) => offlineStorageError('putMany', cause),
      }),
    delete: (key: string) =>
      Effect.try({
        try: () => {
          getGroup(name).delete(key);
        },
        catch: (cause) => offlineStorageError('delete', cause),
      }),
    clear: () =>
      Effect.try({
        try: () => {
          getGroup(name).clear();
        },
        catch: (cause) => offlineStorageError('clear', cause),
      }),
  });

  return {
    group: makeGroup,
    clear: () =>
      Effect.try({
        try: () => {
          groups.clear();
        },
        catch: (cause) => offlineStorageError('clear', cause),
      }),
  };
};
