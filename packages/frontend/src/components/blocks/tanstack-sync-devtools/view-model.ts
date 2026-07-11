export type {
  InspectorCollection,
  InspectorCollectionKind,
  InspectorPartition,
  InspectorStrategyState,
} from 'std-toolkit/tanstack-sync';

import type { Collection } from '@tanstack/react-db';
import type {
  InspectorCollection,
  InspectorPartition,
} from 'std-toolkit/tanstack-sync';

export type InspectorData = {
  collections: InspectorCollection[];
  partitions: InspectorPartition[];
  /**
   * Persisted SoT entity count per non-partitioned collection. Survives garbage
   * collection (the in-memory `collection.itemCount` drops to 0 once released),
   * so the total-sync row can show a real count even when nothing is resident.
   */
  sotCounts: Record<string, number>;
  readPartitionEntities: (
    collectionName: string,
    partitionKey: string,
  ) => Promise<unknown[]>;
  /** The live collection behind a `collectionName`, for reactive partition queries. */
  getCollection: (
    collectionName: string,
  ) => Collection<any, any, any> | undefined;
  /**
   * Drops a single partition's persisted sync state so its next subscription
   * re-syncs from scratch. Only safe while the partition has no subscriber — an
   * active partition re-persists its in-memory snapshot on every tick and would
   * overwrite the reset.
   */
  clearPartitionSyncState: (
    collectionName: string,
    partitionKey: string,
  ) => Promise<void>;
  /**
   * Clears a collection's cached entries from offline storage, bypassing
   * TanStack DB so no delete is synced upstream.
   */
  clearCollectionEntries: (collectionName: string) => Promise<void>;
};
