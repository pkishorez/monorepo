import { parseLoadSubsetOptions } from '@tanstack/query-db-collection';
import type { LoadSubsetOptions } from '@tanstack/react-db';
import { Effect } from 'effect';
import {
  partitionKey as makePartitionKey,
  type PartitionKey,
  type PartitionValue,
} from '../../../domain/identity/index.js';

// TanStack DB hands `loadSubset` field references relative to the collection
// (the query alias already removed), so a key path matches the whole reference.
const partitionPathOf = (
  reference: readonly unknown[],
  partitionPaths: readonly string[],
): string | undefined =>
  partitionPaths.find((path) => reference.map(String).join('.') === path);

// The first `eq` filter on a partition key path names the Partition; no match
// means the global Partition covers it, or the query is unservable.
export const resolvePartitionKey = (
  opts: LoadSubsetOptions,
  partitionPaths: string[],
): {
  field: string;
  partitionValue: PartitionValue;
  partitionKey: PartitionKey;
} | null => {
  const parsed = parseLoadSubsetOptions(opts);
  const match = parsed.filters.find(
    (f) =>
      f.operator === 'eq' &&
      partitionPathOf(f.field, partitionPaths) !== undefined,
  );
  if (!match) return null;

  const field = partitionPathOf(match.field, partitionPaths)!;
  const partitionValue = match.value;
  if (
    typeof partitionValue !== 'string' &&
    typeof partitionValue !== 'number' &&
    typeof partitionValue !== 'boolean'
  ) {
    return null;
  }

  return {
    field,
    partitionValue,
    partitionKey: makePartitionKey({ [field]: partitionValue }),
  };
};

export const makeHybridSync = (
  partitionPaths: string[],
): Effect.Effect<{
  load: (options: LoadSubsetOptions) =>
    | (NonNullable<ReturnType<typeof resolvePartitionKey>> & {
        subscriberCount: number;
        activated: boolean;
      })
    | null;
  unload: (options: LoadSubsetOptions) =>
    | (NonNullable<ReturnType<typeof resolvePartitionKey>> & {
        subscriberCount: number;
        deactivated: boolean;
      })
    | null;
  subscriberCount: (partitionKey: PartitionKey) => number;
  hasSubscribers: () => boolean;
}> =>
  Effect.sync(() => {
    const subscribers = new Map<PartitionKey, number>();
    return {
      load: (options) => {
        const partition = resolvePartitionKey(options, partitionPaths);
        if (!partition) return null;
        const subscriberCount =
          (subscribers.get(partition.partitionKey) ?? 0) + 1;
        if (subscriberCount === 0) subscribers.delete(partition.partitionKey);
        else subscribers.set(partition.partitionKey, subscriberCount);
        return {
          ...partition,
          subscriberCount,
          activated: subscriberCount === 1,
        };
      },
      unload: (options) => {
        const partition = resolvePartitionKey(options, partitionPaths);
        if (!partition) return null;
        const subscriberCount = Math.max(
          0,
          (subscribers.get(partition.partitionKey) ?? 0) - 1,
        );
        if (subscriberCount === 0) subscribers.delete(partition.partitionKey);
        else subscribers.set(partition.partitionKey, subscriberCount);
        return {
          ...partition,
          subscriberCount,
          deactivated: subscriberCount === 0,
        };
      },
      subscriberCount: (partitionKey) => subscribers.get(partitionKey) ?? 0,
      hasSubscribers: () =>
        [...subscribers.values()].some((count) => count > 0),
    };
  });
