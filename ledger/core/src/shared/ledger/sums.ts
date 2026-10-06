import { signed } from './money.ts';
import { type MonthKey, monthOf } from './month.ts';
import type { Account, Category, Entry } from './schemas.ts';

/** Newest first: by day, then by when it was written. */
export const newestFirst = (a: Entry, b: Entry) =>
  b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt);

/** Each Account's balance in cents, by id. */
export const balances = (
  accounts: ReadonlyArray<Account>,
  entries: ReadonlyArray<Entry>,
) => {
  const by = new Map(accounts.map((account) => [account.id, 0]));
  for (const entry of entries) {
    by.set(
      entry.accountId,
      (by.get(entry.accountId) ?? 0) + signed(entry.cents, entry.way),
    );
  }
  return by;
};

export type Spend = {
  readonly category: Category;
  readonly cents: number;
};

export type MonthSummary = {
  readonly month: MonthKey;
  readonly in: number;
  readonly out: number;
  /** Money out by Category, the most first; Categories with none left out. */
  readonly spent: ReadonlyArray<Spend>;
};

/** What came in and went out in one Month, and where it went. */
export const summarize = (
  month: MonthKey,
  entries: ReadonlyArray<Entry>,
  categories: ReadonlyArray<Category>,
): MonthSummary => {
  let total = { in: 0, out: 0 };
  const out = new Map<string, number>();
  for (const entry of entries) {
    if (monthOf(entry.day) !== month) continue;
    total = { ...total, [entry.way]: total[entry.way] + entry.cents };
    if (entry.way === 'out') {
      out.set(entry.categoryId, (out.get(entry.categoryId) ?? 0) + entry.cents);
    }
  }
  const spent = categories
    .map((category) => ({ category, cents: out.get(category.id) ?? 0 }))
    .filter((spend) => spend.cents > 0)
    .sort((a, b) => b.cents - a.cents);
  return { month, ...total, spent };
};

/** Every Month with an Entry, newest first, with its totals. */
export const monthsOf = (
  entries: ReadonlyArray<Entry>,
  categories: ReadonlyArray<Category>,
) =>
  [...new Set(entries.map((entry) => monthOf(entry.day)))]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => summarize(month, entries, categories));

/** Entries by day, newest day first. */
export const byDay = (entries: ReadonlyArray<Entry>) => {
  const days = new Map<string, Entry[]>();
  for (const entry of [...entries].sort(newestFirst)) {
    days.set(entry.day, [...(days.get(entry.day) ?? []), entry]);
  }
  return [...days];
};
