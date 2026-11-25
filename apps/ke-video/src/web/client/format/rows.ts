/*
 * Where each row of a long list sits, from the heights measured so far
 * and a guess for the rest: what a list drawing only the rows in view
 * needs to know which those are, and how much room the others take.
 */

/** Where each of `count` rows starts, in px from the list's top, then where the last ends. */
export const offsetsOf = (count: number, height: (index: number) => number) => {
  const offsets = new Float64Array(count + 1);
  for (let index = 0; index < count; index += 1)
    offsets[index + 1] = offsets[index]! + height(index);
  return offsets;
};

/** The row at `px` from the list's top: the last one starting at or above it, kept within the list. */
export const indexAt = (offsets: Float64Array, px: number) => {
  const count = offsets.length - 1;
  if (count <= 0) return 0;
  let low = 0;
  let high = count - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (offsets[middle]! <= px) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
};

/**
 * The rows to draw for a view from `top` to `bottom` px of the list, with
 * `overscan` px more either side: from `start` up to, not with, `end`.
 */
export const rangeOf = (
  offsets: Float64Array,
  top: number,
  bottom: number,
  overscan: number,
) => {
  const count = offsets.length - 1;
  if (count <= 0 || bottom + overscan < 0 || top - overscan > offsets[count]!)
    return { start: 0, end: 0 };
  const start = indexAt(offsets, top - overscan);
  const end = indexAt(offsets, bottom + overscan) + 1;
  return { start, end: Math.min(count, end) };
};
