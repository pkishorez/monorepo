/** How far, in px, each Step past the first takes. */
export const STEP = 30;

/**
 * The Steps a vertical travel has taken, down being more: none short of
 * `first` px, the first at it, then one more each STEP px, either way, all
 * counted from where the travel began.
 */
export const stepsOf = (travel: number, first: number) => {
  const gone = Math.abs(travel);
  if (gone < first) return 0;
  return Math.sign(travel) * (1 + Math.floor((gone - first) / STEP));
};

/** The index `at` held among `count` items: never past an end. */
export const clamp = (count: number, at: number) =>
  Math.min(count - 1, Math.max(0, at));
