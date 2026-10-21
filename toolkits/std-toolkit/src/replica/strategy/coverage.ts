import type { Wire } from './forward.js';

/** A stretch of the Backend, from `low` to `high` by `_u`, read completely. */
export type Slice = { readonly low: Wire; readonly high: Wire };

const u = (entity: Wire) => entity.meta._u;

/** Adds a slice and merges every pair that touches or overlaps. */
export const cover = (slices: ReadonlyArray<Slice>, added: Slice): Slice[] => {
  const ordered = [...slices, added].sort((left, right) =>
    u(left.low) < u(right.low) ? -1 : u(left.low) > u(right.low) ? 1 : 0,
  );
  const merged: Slice[] = [];
  for (const slice of ordered) {
    const previous = merged.at(-1);
    if (previous && u(slice.low) <= u(previous.high)) {
      if (u(slice.high) >= u(previous.high))
        merged[merged.length - 1] = { low: previous.low, high: slice.high };
    } else {
      merged.push(slice);
    }
  }
  return merged;
};
