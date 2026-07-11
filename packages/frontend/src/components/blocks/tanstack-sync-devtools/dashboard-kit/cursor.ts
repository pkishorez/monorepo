/**
 * Extracts the comparable `_u` update cursor (an ISO timestamp string) from a
 * cursor entity. Strategy-state cursors and newToOld slice `low`/`high` bounds
 * are stored as full cursor entities `{ meta: { _u } }`, not bare strings — so
 * stringifying them yields "[object Object]". Returns null when no `_u` is found.
 */
export const cursorU = (cursor: unknown): string | null => {
  if (cursor == null) return null;
  if (typeof cursor === 'string') return cursor;
  if (typeof cursor !== 'object') return null;
  const obj = cursor as Record<string, unknown>;
  const meta = obj.meta as Record<string, unknown> | undefined;
  const u = meta?._u ?? obj._u;
  return typeof u === 'string' ? u : null;
};
