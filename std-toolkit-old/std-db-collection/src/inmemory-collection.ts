import { createCollection, SyncConfig } from '@tanstack/react-db';
import { BulkOp } from './types.js';

export const createInMemoryCollection = <T extends object = any>({
  getKey,
}: {
  getKey: (item: T) => string;
}) => {
  let syncParams: {
    current: Parameters<SyncConfig<any, string>['sync']>[0] | null;
  } = { current: null };
  const collection = createCollection({
    sync: {
      sync(params) {
        syncParams.current = params;
        params.markReady();
      },
    },
    getKey,
  });

  return {
    Type: null as any as T,
    collection,
    getAll: () => Array.from(collection.entries()),
    insert: (values: T[]) => {
      if (!syncParams.current) {
        return;
      }
      const { begin, commit, write } = syncParams.current;
      begin();
      values.forEach((v) => {
        write({ type: 'insert', value: v });
      });
      commit();
    },
    bulkOp: (values: BulkOp<T>[]) => {
      if (!syncParams.current || values.length === 0) return;
      const { collection, begin, write, commit } = syncParams.current;

      begin();

      values.forEach((obj) => {
        if (obj.type === 'upsert') {
          const { value } = obj;
          const key = getKey(value);
          if (collection.has(key)) {
            write({ type: 'update', value: value });
          } else {
            write({ type: 'insert', value: value });
          }
        } else if (obj.type === 'deleteKey') {
          const value = collection.get(obj.key);
          if (value) {
            write({ type: 'delete', value });
          }
        } else {
          const { type, value } = obj;
          write({ type, value });
        }
      });

      commit();
    },
    update: collection.update.bind(collection),
    updateItem: (value: T) => {
      if (!syncParams.current) {
        return;
      }
      const { begin, commit, write } = syncParams.current;
      begin();
      write({ type: 'update', value });
      commit();
    },
    delete: (value: T) => {
      if (!syncParams.current) {
        return;
      }
      const { begin, commit, write } = syncParams.current;
      begin();
      write({ type: 'delete', value });
      commit();
    },
    deleteKey: (key: string) => {
      const value = collection.get(key);
      if (!syncParams.current || !value) {
        return;
      }
      const { begin, commit, write } = syncParams.current;
      begin();
      write({ type: 'delete', value });
      commit();
    },
  };
};
