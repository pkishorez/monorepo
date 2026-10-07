import { useMemo } from 'react';
import type { Money } from '../session/index.ts';
import {
  type Account,
  type Entry,
  isMonthKey,
  type MonthKey,
  monthName,
  monthOf,
  monthsOf,
  shiftMonth,
  shiftDay,
  summarize,
  today,
} from '../model/index.ts';

type Ledger = Pick<Money, 'accounts' | 'categories' | 'entries'>;

/** The user's Accounts and Categories by id. */
export const useLookup = (money: Ledger) =>
  useMemo(
    () => ({
      account: new Map(money.accounts.map((account) => [account.id, account])),
      category: new Map(
        money.categories.map((category) => [category.id, category]),
      ),
    }),
    [money.accounts, money.categories],
  );

// ---------------------------------------------------------------- Home

/**
 * Home's glance at a Month: what is left, in against out (`most` is the
 * larger, for the bars), the Budgets fullest first, and the latest Entries.
 */
export const glance = (money: Ledger, month: MonthKey) => {
  const summary = summarize(month, money.entries, money.categories);
  const budgets = money.categories
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
    recent: money.entries.slice(0, 6),
    most: Math.max(summary.in, summary.out, 1),
  };
};

// ---------------------------------------------------------------- Months

/** The Months, newest first, and the most that came in or went out in one. */
export const monthsView = (money: Ledger) => {
  const months = monthsOf(money.entries, money.categories);
  return {
    months,
    most: Math.max(1, ...months.flatMap((month) => [month.in, month.out])),
  };
};

// Money out on each day of the Month, from the first.
const dailySpend = (entries: ReadonlyArray<Entry>, month: MonthKey) => {
  const [year = 0, index = 1] = month.split('-').map(Number);
  const length = new Date(year, index, 0).getDate();
  const days = Array.from({ length }, () => 0);
  for (const entry of entries) {
    if (entry.way !== 'out' || !entry.day.startsWith(month)) continue;
    const day = Number(entry.day.slice(8, 10)) - 1;
    days[day] = (days[day] ?? 0) + entry.cents;
  }
  return days;
};

/**
 * One Month: its summary and what is left, the Months either side and
 * whether each can be turned to (never past this Month or before the
 * first Entry's), and money out each day with its peak.
 */
export const monthView = (money: Ledger, month: MonthKey) => {
  const summary = summarize(month, money.entries, money.categories);
  const first = money.entries.at(-1);
  const later = shiftMonth(month, 1);
  const earlier = shiftMonth(month, -1);
  const days = dailySpend(money.entries, month);
  return {
    summary,
    left: summary.in - summary.out,
    later,
    earlier,
    hasLater: later <= monthOf(today()),
    hasEarlier: first !== undefined && earlier >= monthOf(first.day),
    days,
    peak: Math.max(1, ...days),
  };
};

// ---------------------------------------------------------------- Entries

/** What Entries shows: all, or one Account, Category or Month; `at` is marked. */
export type EntriesSearch = {
  readonly account?: string;
  readonly category?: string;
  readonly month?: string;
  readonly at?: string;
};

const text = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** Reads the search of an Entries address, dropping anything else. */
export const validateEntriesSearch = (
  search: Record<string, unknown>,
): EntriesSearch => {
  const month = text(search['month']);
  return {
    ...(text(search['account']) ? { account: text(search['account']) } : {}),
    ...(text(search['category']) ? { category: text(search['category']) } : {}),
    ...(month && isMonthKey(month) ? { month } : {}),
    ...(text(search['at']) ? { at: text(search['at']) } : {}),
  };
};

/** The Entries the search shows, newest first. */
export const shownBy = (entries: ReadonlyArray<Entry>, search: EntriesSearch) =>
  entries.filter(
    (entry) =>
      (search.account === undefined || entry.accountId === search.account) &&
      (search.category === undefined || entry.categoryId === search.category) &&
      (search.month === undefined || monthOf(entry.day) === search.month),
  );

/** The narrowing in words, `Card · Food · March 2026`, or undefined. */
export const narrowedTo = (money: Ledger, search: EntriesSearch) => {
  const parts = [
    search.account && money.accounts.find((a) => a.id === search.account)?.name,
    search.category &&
      money.categories.find((c) => c.id === search.category)?.name,
    search.month && monthName(search.month),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
};

/** The search without its mark: what to keep when moving between Entries. */
export const narrowing = (search: EntriesSearch): EntriesSearch => {
  const { at: _, ...rest } = search;
  return rest;
};

/**
 * One Entry among those the search shows: it (or, narrowed away, from all
 * of them), where it stands as `3 of 12`, and the ones beside it for Next
 * and Previous.
 */
export const entryAt = (
  entries: ReadonlyArray<Entry>,
  search: EntriesSearch,
  id: string,
) => {
  const shown = shownBy(entries, search);
  const at = shown.findIndex((entry) => entry.id === id);
  return {
    entry: shown[at] ?? entries.find((each) => each.id === id),
    position: at >= 0 ? `${at + 1} of ${shown.length}` : undefined,
    next: shown[at + 1],
    previous: shown[at - 1],
  };
};

/**
 * The Entry to mark once `removed` goes: the one after it, else the one
 * before, when it was the marked one; otherwise the mark stays.
 */
export const markAfterRemoving = (
  shown: ReadonlyArray<Entry>,
  removed: Entry,
  marked: string | undefined,
) => {
  if (removed.id !== marked) return marked;
  const index = shown.indexOf(removed);
  const to = index + 1 < shown.length ? index + 1 : index - 1;
  return shown[Math.max(0, Math.min(to, shown.length - 1))]?.id;
};

// ---------------------------------------------------------------- Add

/** The kinds of Account, in the order money moves through them. */
export const ACCOUNT_KINDS: ReadonlyArray<{
  readonly value: Account['kind'];
  readonly label: string;
}> = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank' },
  { value: 'savings', label: 'Savings' },
];

/** The Account a new Entry starts on: a card, else the first; '' with none. */
export const firstAccount = (accounts: ReadonlyArray<Account>) =>
  accounts.find((account) => account.kind === 'card')?.id ??
  accounts[0]?.id ??
  '';

/** The days a new Entry offers in one tap: today and yesterday. */
export const quickDays = () => [
  { value: today(), label: 'Today' },
  { value: shiftDay(today(), -1), label: 'Yesterday' },
];
