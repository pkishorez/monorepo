const units: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** How long ago `at` was, in words: `5 minutes ago`, `40 seconds ago`, `just now` under 10 seconds. */
export const ago = (at: number, now = Date.now()) => {
  const seconds = (at - now) / 1000;
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size)
      return relative.format(Math.round(seconds / size), unit);
  if (Math.abs(seconds) >= 10)
    return relative.format(Math.round(seconds), 'second');
  return 'just now';
};

const marks: ReadonlyArray<[string, number]> = [
  ['y', 365 * 24 * 3600],
  ['mo', 30 * 24 * 3600],
  ['w', 7 * 24 * 3600],
  ['d', 24 * 3600],
  ['h', 3600],
  ['m', 60],
];

/** How long ago `at` was, at a glance: `now` under a minute, then `5m`, `3h`, `2d`, `4w`, `6mo`, `1y`. */
export const since = (at: number, now = Date.now()) => {
  const seconds = (now - at) / 1000;
  for (const [mark, size] of marks)
    if (seconds >= size) return `${Math.floor(seconds / size)}${mark}`;
  return 'now';
};

const pad = (n: number) => String(n).padStart(2, '0');

/** How long something has run, short and ticking: `8s`, `4m 05s`, `2h 03m`. */
export const elapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
};
