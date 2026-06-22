import {
  createCollection,
  localOnlyCollectionOptions,
} from '@tanstack/react-db';
import type { Collection } from '@tanstack/react-db';
import type { InspectorCollection, InspectorPartition } from './types.js';

type InspectorStore<T extends object> = Collection<T, string, any>;

export type SyncInspector = {
  collections: InspectorStore<InspectorCollection>;
  partitions: InspectorStore<InspectorPartition>;
  getCollection: (
    collectionName: string,
  ) => Collection<any, any, any> | undefined;
};

export type WritableSyncInspector = SyncInspector & {
  upsertCollection: (row: InspectorCollection) => void;
  upsertPartition: (row: InspectorPartition) => void;
  updateCollection: (id: string, partial: Partial<InspectorCollection>) => void;
  updatePartition: (id: string, partial: Partial<InspectorPartition>) => void;
  attachCollection: (
    collectionName: string,
    collection: Collection<any, any, any>,
  ) => void;
};

const upsertInto = <T extends { id: string }>(
  collection: InspectorStore<T>,
  row: T,
): void => {
  if (collection.has(row.id)) {
    collection.update(row.id, (draft) => {
      Object.assign(draft, row);
    });
  } else {
    collection.insert(row);
  }
};

const mergeInto = <T extends { id: string }>(
  collection: InspectorStore<T>,
  id: string,
  partial: Partial<T>,
): void => {
  if (!collection.has(id)) return;
  collection.update(id, (draft) => {
    Object.assign(draft, partial);
  });
};

export const makeSyncInspector = (): WritableSyncInspector => {
  const collections = createCollection(
    localOnlyCollectionOptions<InspectorCollection, string>({
      getKey: (row) => row.id,
    }),
  );
  const partitions = createCollection(
    localOnlyCollectionOptions<InspectorPartition, string>({
      getKey: (row) => row.id,
    }),
  );

  const liveCollections = new Map<string, Collection<any, any, any>>();

  return {
    collections,
    partitions,
    getCollection: (name) => liveCollections.get(name),
    upsertCollection: (row) => upsertInto(collections, row),
    upsertPartition: (row) => upsertInto(partitions, row),
    updateCollection: (id, partial) => mergeInto(collections, id, partial),
    updatePartition: (id, partial) => mergeInto(partitions, id, partial),
    attachCollection: (name, collection) =>
      liveCollections.set(name, collection),
  };
};
