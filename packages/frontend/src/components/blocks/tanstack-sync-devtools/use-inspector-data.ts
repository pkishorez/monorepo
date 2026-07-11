import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { Collection } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useTanStackSyncDevtools } from './internal/context';
import type {
  InspectorCollection,
  InspectorData,
  InspectorPartition,
} from './view-model';

const readSotEntities = (
  runPromise: ReturnType<typeof useTanStackSyncDevtools>['runPromise'],
  inspector: ReturnType<typeof useTanStackSyncDevtools>['inspector'],
  collectionName: string,
  partitionKey: string,
): Promise<unknown[]> =>
  runPromise(
    inspector
      .readEntities(collectionName, partitionKey)
      .pipe(Effect.orElseSucceed(() => [] as unknown[])),
  );

const readSotCounts = (
  runPromise: ReturnType<typeof useTanStackSyncDevtools>['runPromise'],
  inspector: ReturnType<typeof useTanStackSyncDevtools>['inspector'],
  collectionNames: ReadonlyArray<string>,
): Promise<Record<string, number>> =>
  runPromise(
    Effect.gen(function* () {
      const counts: Record<string, number> = {};
      for (const name of collectionNames) {
        counts[name] = yield* inspector.countEntities(name);
      }
      return counts;
    }).pipe(Effect.orElseSucceed(() => ({}) as Record<string, number>)),
  );

/**
 * Subscribes the devtools tray to an inspector store without re-rendering it
 * synchronously. The inspector stores are written while *other* components are
 * mid-render — e.g. a page subscribing to a synced collection bumps that
 * collection's subscriber count during its own render. Notifying React inline
 * (as `useLiveQuery` does) would schedule a tray update during that foreign
 * render, tripping the "setState while rendering" warning. Deferring the
 * notification to a microtask lands the update after the current render commits,
 * while `useSyncExternalStore` keeps subscription lifecycle correct.
 */
function useDeferredInspectorRows<T extends object>(
  collection: Collection<T, string, any>,
): T[] {
  const snapshotRef = useRef<T[]>(collection.toArray);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      snapshotRef.current = collection.toArray;
      const sub = collection.subscribeChanges(() => {
        snapshotRef.current = collection.toArray;
        queueMicrotask(onStoreChange);
      });
      return () => sub.unsubscribe();
    },
    [collection],
  );

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useInspectorData(): InspectorData {
  const { inspector, runPromise } = useTanStackSyncDevtools();
  const liveCollections = useDeferredInspectorRows(inspector.collections);
  const livePartitions = useDeferredInspectorRows(inspector.partitions);

  const collections = liveCollections as InspectorCollection[];
  const partitions = livePartitions as InspectorPartition[];

  const nonPartitioned = collections
    .filter((c) => c.partitionFields.length === 0)
    .map((c) => c.collectionName);

  // Re-counts when a collection's residency flips (status change) — the moment
  // the in-memory count stops being authoritative.
  const { data: sotCounts } = useQuery({
    enabled: nonPartitioned.length > 0,
    queryKey: [
      'devtools-sot-counts',
      collections.map((c) => `${c.collectionName}:${c.status}`).join(','),
    ],
    queryFn: () => readSotCounts(runPromise, inspector, nonPartitioned),
  });

  const readPartitionEntities = useCallback(
    (collectionName: string, partitionKey: string) =>
      readSotEntities(runPromise, inspector, collectionName, partitionKey),
    [inspector, runPromise],
  );

  const getCollection = useCallback(
    (collectionName: string) => inspector.getCollection(collectionName),
    [inspector],
  );

  const clearPartitionSyncState = useCallback(
    (collectionName: string, partitionKey: string) =>
      runPromise(inspector.clearSyncState(collectionName, partitionKey)),
    [inspector, runPromise],
  );

  const clearCollectionEntries = useCallback(
    (collectionName: string) =>
      runPromise(inspector.clearEntries(collectionName)),
    [inspector, runPromise],
  );

  return {
    collections,
    partitions,
    sotCounts: sotCounts ?? {},
    readPartitionEntities,
    getCollection,
    clearPartitionSyncState,
    clearCollectionEntries,
  };
}
