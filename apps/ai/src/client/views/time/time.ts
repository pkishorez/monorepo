const units: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** How long ago `at` was, in words: `5 minutes ago`, `yesterday`, `just now`. */
export const ago = (at: number, now = Date.now()) => {
  const seconds = (at - now) / 1000;
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size)
      return relative.format(Math.round(seconds / size), unit);
  return 'just now';
};
