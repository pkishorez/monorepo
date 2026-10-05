import type { Money } from '../../../state/session/index.ts';
import {
  type Entry,
  isMonthKey,
  monthName,
  monthOf,
} from '../../../../domain/ledger/index.ts';

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
export const narrowedTo = (money: Money, search: EntriesSearch) => {
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
