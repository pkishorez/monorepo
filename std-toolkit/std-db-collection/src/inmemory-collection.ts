import { createCollection, SyncConfig } from '@tanstack/react-db';

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
    collection,
    insert: (value: T) => {
      if (!syncParams.current) {
        return;
      }
      const { begin, commit, write } = syncParams.current;
      begin();
      write({ type: 'insert', value });
      commit();
    },
    update: (value: T) => {
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
  };
};
