export const GLOBAL_PARTITION_KEY = '__total__';

export type PartitionValue = string | number | boolean;

/**
 * Produces a stable string key for a partition descriptor, independent of key
 * insertion order. Used as the map/refcount key for per-partition sync state.
 */
export const serializePartition = (
  partition: Record<string, PartitionValue>,
): string =>
  JSON.stringify(
    Object.entries(partition)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, value]) => [field, typeof value, value]),
  );
