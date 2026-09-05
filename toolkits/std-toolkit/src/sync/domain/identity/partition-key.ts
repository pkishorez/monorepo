import type { Brand } from './brand.js';

export type PartitionKey = string & Brand<'PartitionKey'>;

export type PartitionValue = string | number | boolean;

export const GLOBAL_PARTITION_KEY = '__total__' as PartitionKey;

// Stable regardless of field insertion order; the map and ref-count key of a Partition.
export const partitionKey = (
  partition: Record<string, PartitionValue>,
): PartitionKey =>
  JSON.stringify(
    Object.entries(partition)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, value]) => [field, typeof value, value]),
  ) as PartitionKey;
