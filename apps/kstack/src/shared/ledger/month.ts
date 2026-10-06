/** A Month as `YYYY-MM`; a day as `YYYY-MM-DD`. Both sort as text. */
export type MonthKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

/** A local date as `YYYY-MM-DD`. */
export const dayOf = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const today = () => dayOf(new Date());

/** The Month a day is in. */
export const monthOf = (day: string): MonthKey => day.slice(0, 7);

/** The Month `by` Months after `month`; before when negative. */
export const shiftMonth = (month: MonthKey, by: number): MonthKey => {
  const [year = 0, index = 1] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + by, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

export const isMonthKey = (text: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(text);

/** `October 2026`. */
export const monthName = (month: MonthKey) => {
  const [year = 0, index = 1] = month.split('-').map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

/** `Today`, `Yesterday`, or `Mon, Oct 5`. */
export const dayName = (day: string) => {
  const now = today();
  if (day === now) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === dayOf(yesterday)) return 'Yesterday';
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};
