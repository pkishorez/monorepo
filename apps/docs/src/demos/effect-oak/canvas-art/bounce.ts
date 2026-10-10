/**
 * Where a point that moved freely to `free` really is, bouncing between
 * `min` and `max`: the free line folded back and forth into the box.
 */
export const bounce = (free: number, min: number, max: number) => {
  const span = max - min;
  if (span <= 0) return min;
  const folded = (((free - min) % (2 * span)) + 2 * span) % (2 * span);
  return min + (folded <= span ? folded : 2 * span - folded);
};
