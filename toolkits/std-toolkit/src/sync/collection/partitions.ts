import { parseLoadSubsetOptions } from '@tanstack/query-db-collection';
import type { LoadSubsetOptions } from '@tanstack/react-db';
import {
  partitionKey as makePartitionKey,
  type PartitionKey,
  type PartitionValue,
} from '../domain/identity/index.js';

export type ActivePartition = {
  readonly path: string;
  readonly value: PartitionValue;
  readonly key: PartitionKey;
};

// TanStack DB hands `loadSubset` field references relative to the collection
// (the query alias already removed), so a key path matches the whole reference.
const resolve = (
  options: LoadSubsetOptions,
  paths: readonly string[],
): ActivePartition | null => {
  const pathOf = (reference: readonly unknown[]) =>
    paths.find((path) => reference.map(String).join('.') === path);
  // The first `eq` filter on a partition key path names the Partition.
  const match = parseLoadSubsetOptions(options).filters.find(
    (filter) => filter.operator === 'eq' && pathOf(filter.field) !== undefined,
  );
  if (!match) return null;
  const value = match.value;
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  )
    return null;
  const path = pathOf(match.field)!;
  return { path, value, key: makePartitionKey({ [path]: value }) };
};

/**
 * Counts the queries using each Partition. A Partition becomes active with
 * its first query and inactive when its last one leaves.
 */
export const makePartitions = (paths: readonly string[]) => {
  const counts = new Map<PartitionKey, number>();
  return {
    load: (options: LoadSubsetOptions) => {
      const partition = resolve(options, paths);
      if (!partition) return null;
      const count = (counts.get(partition.key) ?? 0) + 1;
      counts.set(partition.key, count);
      return { partition, activated: count === 1 };
    },
    unload: (options: LoadSubsetOptions) => {
      const partition = resolve(options, paths);
      if (!partition) return null;
      const count = Math.max(0, (counts.get(partition.key) ?? 0) - 1);
      if (count === 0) counts.delete(partition.key);
      else counts.set(partition.key, count);
      return { partition, deactivated: count === 0 };
    },
    clear: () => counts.clear(),
  };
};
