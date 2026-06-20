import { parseLoadSubsetOptions } from '@tanstack/query-db-collection';
import type { LoadSubsetOptions } from '@tanstack/react-db';
import { serializePartition } from '../util/serialize-partition.js';

/**
 * Resolves a TanStack `loadSubset` request to a partition. Parses the options, then
 * finds the first `eq` filter whose last field segment matches one of
 * `partitionFields`. On a match returns the matched field, its filter value, and the
 * stable partition key; on no match (or no value) returns `null`. The caller decides
 * what `null` means (global covers it, or an unservable query).
 */
export const resolvePartitionKey = (
  opts: LoadSubsetOptions,
  partitionFields: string[],
): { field: string; partitionValue: unknown; partitionKey: string } | null => {
  const parsed = parseLoadSubsetOptions(opts);
  const match = parsed.filters.find(
    (f) =>
      f.operator === 'eq' &&
      f.field.length > 0 &&
      partitionFields.includes(String(f.field[f.field.length - 1]!)),
  );
  if (!match) return null;

  const field = String(match.field[match.field.length - 1]!);
  const partitionValue = match.value;
  if (partitionValue === undefined) return null;

  return {
    field,
    partitionValue,
    partitionKey: serializePartition({ [field]: String(partitionValue) }),
  };
};
