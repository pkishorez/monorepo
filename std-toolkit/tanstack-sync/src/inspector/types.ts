export type InspectorCollectionKind = 'keyed' | 'partitioned' | 'single-item';

export type InspectorCollection = {
  id: string;
  collectionName: string;
  kind: InspectorCollectionKind;
  status: string;
  itemCount: number;
  subscriberCount: number;
  partitionFields: ReadonlyArray<string>;
};

export type InspectorStrategyState =
  | { strategy: 'oldToNew'; cursor: unknown | null }
  | {
      strategy: 'newToOld';
      slices: ReadonlyArray<{ low: unknown; high: unknown; itemCount: number }>;
      reachedOldest: boolean;
    };

export type InspectorPartition = {
  id: string;
  collectionName: string;
  partitionField: string;
  partitionValue: string;
  partitionKey: string;
  partitionKind: 'global' | 'partition';
  activity: 'active' | 'cached';
  itemCount: number;
  subscriberCount: number;
  strategyState: InspectorStrategyState;
};
