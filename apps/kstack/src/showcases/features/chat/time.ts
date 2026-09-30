const DAY = 86_400_000;

const startOfDay = (at: number) => new Date(at).setHours(0, 0, 0, 0);

const clock = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const longWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const date = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

/** A message's time of day, such as 9:41. */
export const timeOf = (at: number) => clock.format(at);

/** When a chat last spoke, as a list shows it: 9:41, Yesterday, Mon, Mar 3. */
export const whenOf = (at: number, now = Date.now()) => {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days <= 0) return clock.format(at);
  if (days === 1) return 'Yesterday';
  if (days < 7) return weekday.format(at);
  return date.format(at);
};

/** A thread's day separator: Today, Yesterday, Monday, Mar 3. */
export const dayOf = (at: number, now = Date.now()) => {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return longWeekday.format(at);
  return date.format(at);
};

/** Whether two times fall on the same day. */
export const sameDay = (a: number, b: number) =>
  startOfDay(a) === startOfDay(b);
