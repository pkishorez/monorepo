const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const daysFrom = (now: Date, date: Date) =>
  Math.round((startOfDay(date) - startOfDay(now)) / DAY);

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const calendar = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'long',
});

export const formatDate = (date: Date) => calendar.format(date);

export const formatDay = (date: Date, now: Date) =>
  relative.format(daysFrom(now, date), 'day');
