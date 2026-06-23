import {
  createCollection,
  localOnlyCollectionOptions,
} from '@tanstack/react-db';
import type { Collection } from '@tanstack/react-db';
import { Effect } from 'effect';
import type {
  InspectorCollection,
  InspectorPartition,
  InspectorStrategyState,
} from './types.js';

type InspectorStore<T extends object> = Collection<T, string, any>;

/** The zero-progress strategy state for each strategy kind (no cursor, no slices). */
const emptyStrategyState = (
  strategy: InspectorStrategyState['strategy'],
): InspectorStrategyState => {
  switch (strategy) {
    case 'oldToNew':
      return { strategy: 'oldToNew', cursor: null };
    case 'newToOld':
      return { strategy: 'newToOld', slices: [], reachedOldest: false };
    case 'bidirectional':
      return { strategy: 'bidirectional', slices: [] };
  }
};

/**
 * Per-collection handle onto its offline storage, registered by the sync engine
 * at build time. Lets the inspector expose semantic storage operations without
 * its consumer (devtools) reconstructing group-name conventions or the Stored
 * Sync State shape — those stay owned by the engine that wrote them.
 */
export type CollectionStorageControls = {
  /** Live (non-tombstoned) domain values from the collection's source of truth. */
  readValues: () => Effect.Effect<unknown[], unknown>;
  /** Clears every stored entry for the collection. */
  clearEntries: () => Effect.Effect<void, unknown>;
  /** Drops one partition's persisted sync state, keyed by partition key. */
  clearSyncState: (partitionKey: string) => Effect.Effect<void, unknown>;
};

export type SyncInspector = {
  collections: InspectorStore<InspectorCollection>;
  partitions: InspectorStore<InspectorPartition>;
  getCollection: (
    collectionName: string,
  ) => Collection<any, any, any> | undefined;
  /**
   * Live domain values stored for a collection. When `partitionKey` names a
   * field-scoped partition the result is narrowed to that partition's value;
   * a global/total partition (or an omitted key) returns the whole collection.
   */
  readEntities: (
    collectionName: string,
    partitionKey?: string,
  ) => Effect.Effect<unknown[], unknown>;
  /** Count of live (non-tombstoned) entries persisted for a collection. */
  countEntities: (collectionName: string) => Effect.Effect<number, unknown>;
  /** Clears a collection's stored entries (offline storage only, not the server). */
  clearEntries: (collectionName: string) => Effect.Effect<void, unknown>;
  /** Resets one partition's persisted sync state so it re-syncs from scratch. */
  clearSyncState: (
    collectionName: string,
    partitionKey: string,
  ) => Effect.Effect<void, unknown>;
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
  attachStorage: (
    collectionName: string,
    controls: CollectionStorageControls,
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
  const storageControls = new Map<string, CollectionStorageControls>();

  const partitionFilter = (
    values: unknown[],
    collectionName: string,
    partitionKey: string | undefined,
  ): unknown[] => {
    if (partitionKey == null) return values;
    const row = partitions.toArray.find(
      (p) => p.id === `${collectionName}:${partitionKey}`,
    );
    if (!row || row.partitionField === '') return values;
    const { partitionField, partitionValue } = row;
    return values.filter(
      (value) =>
        value != null &&
        typeof value === 'object' &&
        String((value as Record<string, unknown>)[partitionField]) ===
          partitionValue,
    );
  };

  // Drop a partition row to zero so its card reflects the cleared storage
  // immediately, rather than showing the stale snapshot until the next re-sync.
  const resetPartitionRow = (id: string): void => {
    const row = partitions.toArray.find((p) => p.id === id);
    if (!row) return;
    mergeInto(partitions, id, {
      itemCount: 0,
      strategyState: emptyStrategyState(row.strategyState.strategy),
    });
  };

  return {
    collections,
    partitions,
    getCollection: (name) => liveCollections.get(name),
    readEntities: (name, partitionKey) => {
      const controls = storageControls.get(name);
      if (!controls) return Effect.succeed<unknown[]>([]);
      return controls
        .readValues()
        .pipe(
          Effect.map((values) => partitionFilter(values, name, partitionKey)),
        );
    },
    countEntities: (name) => {
      const controls = storageControls.get(name);
      if (!controls) return Effect.succeed(0);
      return controls.readValues().pipe(Effect.map((values) => values.length));
    },
    clearEntries: (name) => {
      const controls = storageControls.get(name);
      if (!controls) return Effect.void;
      // Clearing entries also clears every partition's sync state, so zero each
      // partition row and the collection's total to match the cleared storage.
      return controls.clearEntries().pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            for (const row of partitions.toArray) {
              if (row.collectionName === name) resetPartitionRow(row.id);
            }
            const collectionRow = collections.toArray.find(
              (c) => c.collectionName === name,
            );
            if (collectionRow) {
              mergeInto(collections, collectionRow.id, { itemCount: 0 });
            }
          }),
        ),
      );
    },
    clearSyncState: (name, partitionKey) => {
      const controls = storageControls.get(name);
      if (!controls) return Effect.void;
      return controls
        .clearSyncState(partitionKey)
        .pipe(
          Effect.tap(() =>
            Effect.sync(() => resetPartitionRow(`${name}:${partitionKey}`)),
          ),
        );
    },
    upsertCollection: (row) => upsertInto(collections, row),
    upsertPartition: (row) => upsertInto(partitions, row),
    updateCollection: (id, partial) => mergeInto(collections, id, partial),
    updatePartition: (id, partial) => mergeInto(partitions, id, partial),
    attachCollection: (name, collection) =>
      liveCollections.set(name, collection),
    attachStorage: (name, controls) => storageControls.set(name, controls),
  };
};
