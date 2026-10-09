import { and, count, eq, gte, lt, sum, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import {
  type Account,
  type Category,
  defaultPreferences,
  type Entry,
  type MonthKey,
  type Preferences,
  shiftMonth,
} from '../model/index.ts';
import type { EntriesSearch } from '../places/index.ts';
import { useSession } from '../session/index.ts';
import { byId, usePlain } from './rows.ts';
import {
  daysOf,
  entryAt,
  glance,
  type Lookup,
  monthView,
  monthsView,
  narrowedTo,
} from './views.ts';

// Accounts in the order money moves through them.
const KINDS: ReadonlyArray<Account['kind']> = [
  'cash',
  'card',
  'bank',
  'savings',
];

/** The user's Accounts, in the order money moves through them, then by
 * name. Empty until read. */
export const useAccounts = () => {
  const { accounts } = useSession();
  const query = useLiveQuery((q) => q.from({ row: accounts }));
  const rows = usePlain<Account>(query.data, query.isReady, byId);
  return useMemo(
    () => ({
      ready: query.isReady,
      accounts: [...rows].sort(
        (a, b) =>
          KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
          a.name.localeCompare(b.name),
      ),
    }),
    [query.isReady, rows],
  );
};

/** The user's Categories, money out first, then by name; only one way's
 * with `way`. Empty until read. */
export const useCategories = (way?: Category['way']) => {
  const { categories } = useSession();
  const query = useLiveQuery(
    (q) =>
      way === undefined
        ? q.from({ row: categories })
        : q.from({ row: categories }).where(({ row }) => eq(row.way, way)),
    [way],
  );
  const rows = usePlain<Category>(query.data, query.isReady, byId);
  return useMemo(
    () => ({
      ready: query.isReady,
      categories: [...rows].sort((a, b) =>
        a.way === b.way
          ? a.name.localeCompare(b.name)
          : a.way === 'out'
            ? -1
            : 1,
      ),
    }),
    [query.isReady, rows],
  );
};

/** The user's Accounts and Categories by id. */
export const useLookup = (): Lookup => {
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  return useMemo(
    () => ({
      account: new Map(accounts.map((account) => [account.id, account])),
      category: new Map(categories.map((category) => [category.id, category])),
    }),
    [accounts, categories],
  );
};

/** The currency the user counts in. */
export const useCurrency = () => {
  const session = useSession();
  const query = useLiveQuery((q) => q.from({ row: session.preferences }));
  const own = (query.data as ReadonlyArray<Preferences>)[0];
  return (own ?? defaultPreferences(session.userId)).currency;
};

// Each Account's total one way, summed by the query as Entries change.
const useTotals = (way: Entry['way']) => {
  const { entries } = useSession();
  const query = useLiveQuery(
    (q) =>
      q
        .from({ row: entries })
        .where(({ row }) => eq(row.way, way))
        .groupBy(({ row }) => row.accountId)
        .select(({ row }) => ({
          accountId: row.accountId,
          cents: sum(row.cents),
        })),
    [way],
  );
  return {
    ready: query.isReady,
    totals: query.data as ReadonlyArray<{
      readonly accountId: string;
      readonly cents: number;
    }>,
  };
};

/** Each Account's balance in cents, by id: what came in less what went
 * out. */
export const useBalances = () => {
  const { ready, accounts } = useAccounts();
  const ins = useTotals('in');
  const outs = useTotals('out');
  return useMemo(() => {
    const by = new Map(accounts.map((account) => [account.id, 0]));
    for (const { accountId, cents } of ins.totals)
      by.set(accountId, (by.get(accountId) ?? 0) + cents);
    for (const { accountId, cents } of outs.totals)
      by.set(accountId, (by.get(accountId) ?? 0) - cents);
    return { ready: ready && ins.ready && outs.ready, balances: by };
  }, [accounts, ready, ins, outs]);
};

// The one row a count query gives, or none before it has.
const counted = (data: ReadonlyArray<unknown>) =>
  (data as ReadonlyArray<{ readonly rows: number }>)[0]?.rows ?? 0;

/** How many Entries and Accounts the user has, counted by the queries. */
export const useCounts = () => {
  const session = useSession();
  const entries = useLiveQuery((q) =>
    q
      .from({ row: session.entries })
      .select(({ row }) => ({ rows: count(row.id) })),
  );
  const accounts = useLiveQuery((q) =>
    q
      .from({ row: session.accounts })
      .select(({ row }) => ({ rows: count(row.id) })),
  );
  return {
    ready: entries.isReady && accounts.isReady,
    entries: counted(entries.data),
    accounts: counted(accounts.data),
  };
};

/** Which Entries to read: all, or one Account's, Category's or Month's. */
type EntryFilter = {
  readonly account?: string | undefined;
  readonly category?: string | undefined;
  readonly month?: MonthKey | undefined;
};

/** The Entries `filter` picks, as plain values, newest first, and only the
 * newest `limit` if given. A Month is the range of its days. */
const useEntryRows = (filter: EntryFilter, limit?: number) => {
  const { entries } = useSession();
  const { account, category, month } = filter;
  const query = useLiveQuery(
    (q) => {
      // Each narrowing is one more `where`; together they all hold.
      let narrowed = q.from({ row: entries });
      if (account !== undefined)
        narrowed = narrowed.where(({ row }) => eq(row.accountId, account));
      if (category !== undefined)
        narrowed = narrowed.where(({ row }) => eq(row.categoryId, category));
      if (month !== undefined)
        narrowed = narrowed.where(({ row }) =>
          and(
            gte(row.day, `${month}-01`),
            lt(row.day, `${shiftMonth(month, 1)}-01`),
          ),
        );
      const ordered = narrowed
        .orderBy(({ row }) => row.day, 'desc')
        .orderBy(({ row }) => row.createdAt, 'desc');
      return limit === undefined ? ordered : ordered.limit(limit);
    },
    [account, category, month, limit],
  );
  const rows = usePlain<Entry>(query.data, query.isReady, byId);
  return { ready: query.isReady, entries: rows };
};

/**
 * The Entries a search shows, newest first and by day, and the narrowing in
 * words. Not ready until the Accounts and Categories they name are, so no
 * Entry is drawn without them.
 */
export const useEntries = (search: EntriesSearch) => {
  const accounts = useAccounts();
  const categories = useCategories();
  const lookup = useLookup();
  const { account, category, month } = search;
  const { ready, entries } = useEntryRows({ account, category, month });
  return useMemo(
    () => ({
      ready: ready && accounts.ready && categories.ready,
      shown: entries,
      days: daysOf(entries),
      narrowed: narrowedTo(lookup, { account, category, month }),
      lookup,
    }),
    [
      ready,
      accounts.ready,
      categories.ready,
      entries,
      lookup,
      account,
      category,
      month,
    ],
  );
};

/**
 * One Entry among those a search shows: it (or, narrowed away, wherever it
 * is), where it stands as `3 of 12`, and the ones beside it for Next and
 * Previous.
 */
export const useEntryAt = (search: EntriesSearch, id: string) => {
  const session = useSession();
  const { ready, shown, lookup } = useEntries(search);
  const one = useLiveQuery(
    (q) =>
      q
        .from({ row: session.entries })
        .where(({ row }) => eq(row.id, id))
        .findOne(),
    [id],
  );
  const [found] = usePlain<Entry>(
    one.data === undefined ? [] : [one.data],
    one.isReady,
    byId,
  );
  return useMemo(
    () => ({
      ready: ready && one.isReady,
      ...entryAt(shown, found, id),
      lookup,
    }),
    [ready, one.isReady, shown, found, id, lookup],
  );
};

/**
 * Home's glance at a Month: whether the user has Accounts yet, what is
 * left, in against out, the Budgets fullest first, and the latest Entries.
 */
export const useHome = (month: MonthKey) => {
  const accounts = useAccounts();
  const categories = useCategories();
  const lookup = useLookup();
  const inMonth = useEntryRows({ month });
  const recent = useEntryRows({}, 6);
  return useMemo(
    () => ({
      ready:
        accounts.ready && categories.ready && inMonth.ready && recent.ready,
      hasAccounts: accounts.accounts.length > 0,
      ...glance(month, inMonth.entries, categories.categories, recent.entries),
      lookup,
    }),
    [month, accounts, categories, inMonth, recent, lookup],
  );
};

/** The Months, newest first, and the most that came in or went out in one. */
export const useMonths = () => {
  const categories = useCategories();
  const all = useEntryRows({});
  return useMemo(
    () => ({
      ready: all.ready && categories.ready,
      ...monthsView(all.entries, categories.categories),
    }),
    [all, categories],
  );
};

/**
 * One Month: its summary and what is left, the Months either side and
 * whether each can be turned to, and money out each day with its peak.
 */
export const useMonth = (month: MonthKey) => {
  const { entries } = useSession();
  const categories = useCategories();
  const inMonth = useEntryRows({ month });
  const oldest = useLiveQuery((q) =>
    q
      .from({ row: entries })
      .orderBy(({ row }) => row.day, 'asc')
      .limit(1),
  );
  return useMemo(
    () => ({
      ready: inMonth.ready && categories.ready && oldest.isReady,
      ...monthView(
        month,
        inMonth.entries,
        categories.categories,
        (oldest.data as ReadonlyArray<Entry>)[0],
      ),
    }),
    [month, inMonth, categories, oldest.data, oldest.isReady],
  );
};
