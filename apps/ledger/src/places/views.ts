import {
  type Account,
  type Entry,
  isMonthKey,
  shiftDay,
  today,
} from '../model/index.ts';

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

/** The search without its mark: what to keep when moving between Entries. */
export const narrowing = (search: EntriesSearch): EntriesSearch => {
  const { at: _, ...rest } = search;
  return rest;
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
