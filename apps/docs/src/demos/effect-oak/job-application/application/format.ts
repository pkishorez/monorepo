const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** `2026-04-16` as `Apr 2026`. */
const yearMonth = (date: string) => {
  const [year, month] = date.split('-');
  return `${MONTHS[Number(month) - 1] ?? ''} ${year ?? ''}`;
};

/** `start – Present`, `start – end`, `start`, or nothing without a start. */
export const employmentRange = (entry: {
  readonly start: string;
  readonly end: string;
  readonly current: boolean;
}) => {
  if (entry.start === '') return '';
  const start = yearMonth(entry.start);
  if (entry.current) return `${start} – Present`;
  return entry.end === '' ? start : `${start} – ${yearMonth(entry.end)}`;
};

export const pluralize = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
