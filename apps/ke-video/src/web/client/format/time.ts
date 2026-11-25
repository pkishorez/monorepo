/** `m:ss`, or `h:mm:ss` from an hour on, of whole seconds. */
export const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

/** `HH:MM:SS` of an ISO moment, in local time, as the CLI's log prints it. */
export const timeOfDay = (iso: string) => {
  const at = new Date(iso);
  return [at.getHours(), at.getMinutes(), at.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
};

/** A length in seconds as people say it: `0.6 s`, `12 s`, `3:20`. */
export const span = (seconds: number) =>
  seconds < 10
    ? `${seconds.toFixed(1)} s`
    : seconds < 60
      ? `${Math.round(seconds)} s`
      : clock(seconds);

/**
 * The line being played at `time`: the last one started by then, so a
 * gap between lines keeps the one before; -1 before the first. Lines are
 * in order of `start`.
 */
export const lineAt = (
  lines: ReadonlyArray<{ readonly start: number }>,
  time: number,
) => {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle]!.start <= time) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
};
