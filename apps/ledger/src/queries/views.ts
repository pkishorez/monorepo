import {
  type Account,
  byDay,
  type Category,
  type Entry,
  type MonthKey,
  monthName,
  monthOf,
  monthsOf,
  signed,
  shiftMonth,
  summarize,
  today,
} from '../model/index.ts';
import type { EntriesSearch } from '../places/index.ts';

/** The user's Accounts and Categories by id. */
export type Lookup = {
  readonly account: ReadonlyMap<string, Account>;
  readonly category: ReadonlyMap<string, Category>;
};

/**
 * Home's glance at a Month, from its Entries and the latest ones: what is
 * left, in against out (`most` is the larger, for the bars), and the
 * Budgets fullest first.
 */
export const glance = (
  month: MonthKey,
  inMonth: ReadonlyArray<Entry>,
  categories: ReadonlyArray<Category>,
  recent: ReadonlyArray<Entry>,
) => {
  const summary = summarize(month, inMonth, categories);
  const budgets = categories
    .filter((category) => category.budget > 0)
    .map((category) => ({
      category,
      spent:
        summary.spent.find((spend) => spend.category.id === category.id)
          ?.cents ?? 0,
    }))
    .sort((a, b) => b.spent / b.category.budget - a.spent / a.category.budget);
  return {
    summary,
    left: summary.in - summary.out,
    budgets,
    recent,
    most: Math.max(summary.in, summary.out, 1),
  };
};

/** The Months, newest first, each with what was left, and the most that
 * came in or went out in one. */
export const monthsView = (
  entries: ReadonlyArray<Entry>,
  categories: ReadonlyArray<Category>,
) => {
  const months = monthsOf(entries, categories).map((month) => ({
    ...month,
    left: month.in - month.out,
  }));
  return {
    months,
    most: Math.max(1, ...months.flatMap((month) => [month.in, month.out])),
  };
};

// Money out on each day of the Month, from the first.
const dailySpend = (inMonth: ReadonlyArray<Entry>, month: MonthKey) => {
  const [year = 0, index = 1] = month.split('-').map(Number);
  const length = new Date(year, index, 0).getDate();
  const days = Array.from({ length }, () => 0);
  for (const entry of inMonth) {
    if (entry.way !== 'out' || !entry.day.startsWith(month)) continue;
    const day = Number(entry.day.slice(8, 10)) - 1;
    days[day] = (days[day] ?? 0) + entry.cents;
  }
  return days;
};

/**
 * One Month, from its Entries and the user's oldest: its summary and what
 * is left, the Months either side and whether each can be turned to (never
 * past this Month or before the oldest Entry's), and money out each day
 * with its peak.
 */
export const monthView = (
  month: MonthKey,
  inMonth: ReadonlyArray<Entry>,
  categories: ReadonlyArray<Category>,
  oldest: Entry | undefined,
) => {
  const summary = summarize(month, inMonth, categories);
  const later = shiftMonth(month, 1);
  const earlier = shiftMonth(month, -1);
  const days = dailySpend(inMonth, month);
  return {
    summary,
    left: summary.in - summary.out,
    later,
    earlier,
    hasLater: later <= monthOf(today()),
    hasEarlier: oldest !== undefined && earlier >= monthOf(oldest.day),
    days,
    peak: Math.max(1, ...days),
  };
};

/** Entries by day, newest day first, each day with what it came to. */
export const daysOf = (entries: ReadonlyArray<Entry>) =>
  byDay(entries).map(([day, ofDay]) => ({
    day,
    entries: ofDay,
    net: ofDay.reduce((sum, entry) => sum + signed(entry.cents, entry.way), 0),
  }));

/** The narrowing in words, `Card · Food · March 2026`, or undefined. */
export const narrowedTo = (lookup: Lookup, search: EntriesSearch) => {
  const parts = [
    search.account && lookup.account.get(search.account)?.name,
    search.category && lookup.category.get(search.category)?.name,
    search.month && monthName(search.month),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
};

/**
 * One Entry among those `shown`: it (or, narrowed away, `found` wherever it
 * is), where it stands as `3 of 12`, and the ones beside it for Next and
 * Previous.
 */
export const entryAt = (
  shown: ReadonlyArray<Entry>,
  found: Entry | undefined,
  id: string,
) => {
  const at = shown.findIndex((entry) => entry.id === id);
  return {
    entry: shown[at] ?? found,
    position: at >= 0 ? `${at + 1} of ${shown.length}` : undefined,
    next: shown[at + 1],
    previous: shown[at - 1],
  };
};
