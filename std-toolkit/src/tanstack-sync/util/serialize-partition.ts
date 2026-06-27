/**
 * Produces a stable string key for a partition descriptor, independent of key
 * insertion order. Used as the map/refcount key for per-partition sync state.
 */
export const serializePartition = (p: Record<string, string>): string =>
  JSON.stringify(
    Object.keys(p)
      .sort()
      .map((k) => [k, p[k]]),
  );
