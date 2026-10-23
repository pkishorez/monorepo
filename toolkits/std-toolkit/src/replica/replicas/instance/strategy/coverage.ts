import { samePosition, type Wire } from './forward.js';

/** A stretch of the Backend, from `low` to `high` by `_u`, read completely. */
export type Slice = { readonly low: Wire; readonly high: Wire };

const u = (entity: Wire) => entity.meta._u;

/**
 * Whether `slice` is known to reach into `previous`: its low lies inside, or
 * is `previous`'s high itself. Records that merely share a `_u` are not
 * enough: others on that `_u` may lie between them, still unread.
 */
const reaches = (previous: Slice, slice: Slice) =>
  u(slice.low) < u(previous.high) || samePosition(slice.low, previous.high);

/** Adds a slice and merges every pair that touches or overlaps. */
export const cover = (slices: ReadonlyArray<Slice>, added: Slice): Slice[] => {
  const ordered = [...slices, added].sort((left, right) =>
    u(left.low) < u(right.low) ? -1 : u(left.low) > u(right.low) ? 1 : 0,
  );
  const merged: Slice[] = [];
  for (const slice of ordered) {
    const previous = merged.at(-1);
    if (previous && reaches(previous, slice)) {
      if (u(slice.high) >= u(previous.high))
        merged[merged.length - 1] = { low: previous.low, high: slice.high };
    } else {
      merged.push(slice);
    }
  }
  return merged;
};
