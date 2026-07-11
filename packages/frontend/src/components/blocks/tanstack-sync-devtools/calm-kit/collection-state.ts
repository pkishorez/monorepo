import type {
  InspectorCollection,
  InspectorPartition,
  InspectorStrategyState,
} from '../view-model';

/**
 * How busy a collection is right now, as the panel paints it:
 * - `active`  — at least one live subscription is reading from it
 * - `ready`   — no subscribers, but data is loaded and warm
 * - `idle`    — no subscribers and nothing synced yet
 */
export type CollectionActivity = 'active' | 'ready' | 'idle';

export type ActivityStyle = {
  label: string;
  /** Tailwind classes for the card's border, surface and (active-only) glow. */
  card: string;
  /** Status dot + accent text classes. */
  dot: string;
  text: string;
};

export const ACTIVITY_STYLE: Record<CollectionActivity, ActivityStyle> = {
  active: {
    label: 'active',
    card: 'border-chart-2/50 bg-chart-2/5 ring-1 ring-chart-2/25',
    dot: 'bg-chart-2',
    text: 'text-chart-2',
  },
  ready: {
    label: 'ready',
    card: 'border-border bg-card/40',
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
  },
  idle: {
    label: 'idle',
    card: 'border-border/50 bg-transparent',
    dot: 'bg-muted-foreground/40',
    text: 'text-muted-foreground/60',
  },
};

/**
 * Whether the collection's synced data currently lives in memory, derived from
 * the TanStack DB collection status. Orthogonal to {@link CollectionActivity}:
 * activity tracks subscriptions, residency tracks whether the sync engine still
 * holds the data or has garbage-collected it after its `gcTime` elapsed.
 */
export type Residency = 'in-memory' | 'released' | 'cold' | 'error';

export type ResidencyStyle = {
  label: string;
  /** Text + dot color classes (dot reuses these as bg / border). */
  text: string;
  dot: string;
  border: string;
  /** Solid dot when resident; hollow ring once released or never loaded. */
  filled: boolean;
};

export const RESIDENCY_STYLE: Record<Residency, ResidencyStyle> = {
  'in-memory': {
    label: 'in memory',
    text: 'text-chart-4',
    dot: 'bg-chart-4',
    border: 'border-chart-4',
    filled: true,
  },
  released: {
    label: 'released',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    border: 'border-muted-foreground',
    filled: false,
  },
  cold: {
    label: 'on disk',
    text: 'text-muted-foreground/70',
    dot: 'bg-muted-foreground/60',
    border: 'border-muted-foreground/60',
    filled: false,
  },
  error: {
    label: 'error',
    text: 'text-destructive',
    dot: 'bg-destructive',
    border: 'border-destructive',
    filled: false,
  },
};

export function deriveResidency(status: string): Residency {
  switch (status) {
    case 'loading':
    case 'ready':
      return 'in-memory';
    case 'cleaned-up':
      return 'released';
    case 'error':
      return 'error';
    default:
      return 'cold';
  }
}

/**
 * The single lifecycle state the Outline variant paints, collapsing the
 * orthogonal {@link CollectionActivity} and {@link Residency} axes into one:
 * - `active`    — at least one live subscription is reading it
 * - `in-memory` — resident but unsubscribed, waiting out its `gcTime`
 * - `released`  — garbage-collected after `gcTime`; data lives only on disk
 * - `idle`      — never activated; synced data sits on disk, never loaded
 * - `error`     — sync initialization failed
 */
export type CollectionLifecycle =
  | 'active'
  | 'in-memory'
  | 'released'
  | 'idle'
  | 'error';

export const LIFECYCLE_LABEL: Record<CollectionLifecycle, string> = {
  active: 'active',
  'in-memory': 'in memory',
  released: 'released',
  idle: 'on disk',
  error: 'error',
};

export function deriveLifecycle(
  collection: InspectorCollection,
): CollectionLifecycle {
  if (collection.status === 'error') return 'error';
  if (collection.subscriberCount > 0) return 'active';
  if (collection.status === 'loading' || collection.status === 'ready') {
    return 'in-memory';
  }
  if (collection.status === 'cleaned-up') return 'released';
  return 'idle';
}

export function deriveCollectionActivity(
  collection: InspectorCollection,
  partitions: ReadonlyArray<InspectorPartition>,
  itemCount: number,
): CollectionActivity {
  if (collection.subscriberCount > 0) return 'active';
  const warm = itemCount > 0 || partitions.some((p) => p.activity === 'active');
  return warm ? 'ready' : 'idle';
}

/**
 * A non-partitioned collection (global `oldToNew`/single-item strategy) never
 * registers a partition row, so the panel would otherwise show "no partitions".
 * We surface its whole synced set as one synthetic "total sync" partition. Its
 * key is absent from the live partition list, so `readPartitionEntities` falls
 * back to reading the entire SoT for the collection — exactly the total set.
 */
export function totalSyncPartition(
  collection: InspectorCollection,
): InspectorPartition {
  return {
    id: `${collection.collectionName}:∑total`,
    collectionName: collection.collectionName,
    partitionField: '',
    partitionValue: '',
    partitionKey: 'total collection',
    partitionKind: 'global',
    activity: collection.subscriberCount > 0 ? 'active' : 'cached',
    itemCount: collection.itemCount,
    subscriberCount: collection.subscriberCount,
    strategyState: { strategy: 'oldToNew', cursor: null },
  };
}

export type ResolvedCollection = {
  collection: InspectorCollection;
  partitions: InspectorPartition[];
  /** Authoritative item count; the engine mirrors this on every SoT write. */
  itemCount: number;
  activeCount: number;
  inactiveCount: number;
  activity: CollectionActivity;
  /** True when `partitions` holds the synthetic total-sync row, not real ones. */
  synthetic: boolean;
};

/**
 * The sync strategy kind is configured per collection, not per partition: every
 * partition of a collection syncs the same way, only their runtime cursor/slice
 * state differs. We read it off a real partition (the synthetic total-sync row is
 * always `oldToNew`), falling back to that default when none is resident yet.
 */
export function collectionStrategy(
  resolved: ResolvedCollection,
): InspectorStrategyState['strategy'] {
  const real = resolved.partitions.find((p) => p.partitionKind !== 'global');
  return (real ?? resolved.partitions[0])?.strategyState.strategy ?? 'oldToNew';
}

export function resolveCollection(
  collection: InspectorCollection,
  allPartitions: ReadonlyArray<InspectorPartition>,
  sotCount = 0,
): ResolvedCollection {
  const matching = allPartitions.filter(
    (p) => p.collectionName === collection.collectionName,
  );
  const partitionSum = matching.reduce((sum, p) => sum + p.itemCount, 0);

  // `collection.itemCount` is the live in-memory size; it drops to 0 once the
  // collection is garbage-collected. Fall back to persisted partition sums (for
  // partitioned collections) or the persisted SoT count (for the total-sync
  // row) so a released collection still reports its real total.
  const itemCount = Math.max(collection.itemCount, partitionSum, sotCount);

  // A `global` (total-sync) partition reports the count its sync state accounts
  // for, not the count of entries on disk — so render its own row count, and 0
  // when no sync-state record exists (e.g. after its state was cleared).
  // Otherwise clearing a total collection's sync state could never zero the card,
  // since the on-disk entries survive the clear. Single-item collections keep
  // showing their persisted count (they have no global sync-state row to mirror).
  const real = matching;

  const nonPartitioned = collection.partitionFields.length === 0;
  const synthetic = real.length === 0 && nonPartitioned;
  const syntheticCount = collection.kind === 'single-item' ? itemCount : 0;
  const partitions = synthetic
    ? [{ ...totalSyncPartition(collection), itemCount: syntheticCount }]
    : real;

  const activeCount = partitions.filter((p) => p.activity === 'active').length;
  const inactiveCount = partitions.length - activeCount;

  return {
    collection,
    partitions,
    itemCount,
    activeCount,
    inactiveCount,
    // Activity reflects live residency, so derive it from the in-memory size,
    // not the persisted fallback above.
    activity: deriveCollectionActivity(collection, real, collection.itemCount),
    synthetic,
  };
}
