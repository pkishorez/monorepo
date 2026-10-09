/** A year of weeks, each starting on a Monday (UTC), ending with this one. */

export const WEEKS = 52;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const mondayOf = (time: number) => {
  const day = Math.floor(time / DAY_MS);
  // 1970-01-01 was a Thursday: day 0 is 3 days after a Monday.
  return (day - ((day + 3) % 7)) * DAY_MS;
};

const firstWeek = (now: number) => mondayOf(now) - (WEEKS - 1) * WEEK_MS;

/** Which of the year's weeks a time falls in, or null outside the year. */
export const weekIndex = (now: number, time: number) => {
  const index = Math.floor((mondayOf(time) - firstWeek(now)) / WEEK_MS);
  return index >= 0 && index < WEEKS ? index : null;
};

/** Each week's Monday, as `YYYY-MM-DD`. */
export const weekStarts = (now: number) =>
  Array.from({ length: WEEKS }, (_, i) =>
    new Date(firstWeek(now) + i * WEEK_MS).toISOString().slice(0, 10),
  );
