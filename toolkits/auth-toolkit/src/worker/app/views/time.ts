const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const day = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const dayYear = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "yesterday", "on Oct 3". */
export const ago = (iso: string, now = Date.now()) => {
  const at = new Date(iso).getTime();
  const past = Math.max(0, now - at);
  if (past < MINUTE) return 'just now';
  if (past < HOUR) return relative.format(-Math.round(past / MINUTE), 'minute');
  if (past < DAY) return relative.format(-Math.round(past / HOUR), 'hour');
  if (past < 7 * DAY) return relative.format(-Math.round(past / DAY), 'day');
  return `on ${onDay(iso, now)}`;
};

/** "Oct 3", or "Oct 3, 2025" outside this year. */
export const onDay = (iso: string, now = Date.now()) => {
  const date = new Date(iso);
  return date.getFullYear() === new Date(now).getFullYear()
    ? day.format(date)
    : dayYear.format(date);
};
