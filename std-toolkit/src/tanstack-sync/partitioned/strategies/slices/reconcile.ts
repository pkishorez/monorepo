import { makeSlice, type Slice } from './slice.js';
import { uOf } from './cursors.js';

/** Inserts a range and merges overlapping/touching slices, keeping the list disjoint and ascending. */
export const reconcile = <TItem>(
  slices: readonly Slice<TItem>[],
  candidate: Slice<TItem>,
): Slice<TItem>[] => {
  const all = [...slices, candidate].sort((a, b) =>
    uOf(a.low) < uOf(b.low) ? -1 : uOf(a.low) > uOf(b.low) ? 1 : 0,
  );
  const merged: Slice<TItem>[] = [];
  for (const slice of all) {
    const last = merged[merged.length - 1];
    if (last && uOf(slice.low) <= uOf(last.high)) {
      if (uOf(slice.high) > uOf(last.high)) last.high = slice.high;
    } else {
      merged.push(makeSlice(slice.low, slice.high));
    }
  }
  return merged;
};
