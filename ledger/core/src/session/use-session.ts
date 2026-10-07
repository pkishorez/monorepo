import { useLiveQuery } from '@tanstack/react-db';
import { useMemo, useRef } from 'react';
import {
  type Account,
  type Category,
  defaultPreferences,
  type Entry,
  newestFirst,
} from '../model/index.ts';
import { ledgerSession } from './session.ts';

/** The open Session; only inside the app's `SignedIn`, where it never
 * changes User. */
export const useSession = ledgerSession.use;

/** The User whose Session is open. */
export const useUser = () => useSession().user;

// Accounts in the order money moves through them.
const KINDS: ReadonlyArray<Account['kind']> = [
  'cash',
  'card',
  'bank',
  'savings',
];

// The value fields of a row, without what the Collection adds.
const plain = <T extends object>(row: T): T => {
  const {
    _meta: _,
    $synced: __,
    $origin: ___,
    ...value
  } = row as T & {
    _meta?: unknown;
    $synced?: unknown;
    $origin?: unknown;
  };
  return value as T;
};

// Whether two rows hold the same values, field by field.
const same = (a: object, b: object) => {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.is(left[key], right[key]))
  );
};

/**
 * A kind's rows as plain values, each the same object from one change to the
 * next while its values are the same, so a screen that draws a row only
 * when it changes (a memoised row) skips the rows a write left alone. Empty
 * until `ready`.
 */
const usePlain = <T extends object>(
  data: ReadonlyArray<T>,
  ready: boolean,
  keyOf: (row: T) => string,
): ReadonlyArray<T> => {
  const kept = useRef(new Map<string, T>());
  return useMemo(() => {
    if (!ready) return [];
    const next = new Map<string, T>();
    const rows = data.map((row) => {
      const value = plain(row);
      const key = keyOf(value);
      const before = kept.current.get(key);
      const stays = before !== undefined && same(before, value);
      const stable = stays ? before : value;
      next.set(key, stable);
      return stable;
    });
    kept.current = next;
    return rows;
  }, [data, ready, keyOf]);
};

const byId = (row: { readonly id: string }) => row.id;
const byUser = (row: { readonly userId: string }) => row.userId;

/**
 * The user's money as it stands, live: every Account, Category and Entry
 * (Entries newest first), their currency, and whether the first read
 * from this device's copy is done. Until it is, every list is empty, so no
 * Place draws half a copy (Entries without their Categories). A write to
 * one kind leaves the others' lists as they were, and every row it did not
 * change the same object.
 */
export const useMoney = () => {
  const ledger = useSession();
  const accounts = useLiveQuery((q) => q.from({ row: ledger.accounts }));
  const categories = useLiveQuery((q) => q.from({ row: ledger.categories }));
  const entries = useLiveQuery((q) => q.from({ row: ledger.entries }));
  const preferences = useLiveQuery((q) => q.from({ row: ledger.preferences }));
  const ready =
    accounts.isReady &&
    categories.isReady &&
    entries.isReady &&
    preferences.isReady;
  const accountRows = usePlain(accounts.data, ready, byId);
  const categoryRows = usePlain(categories.data, ready, byId);
  const entryRows = usePlain(entries.data, ready, byId);
  const own = usePlain(preferences.data, ready, byUser)[0];
  const sortedAccounts = useMemo(
    () =>
      [...accountRows].sort(
        (a, b) =>
          KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
          a.name.localeCompare(b.name),
      ),
    [accountRows],
  );
  const sortedCategories = useMemo(
    () =>
      [...categoryRows].sort((a, b) =>
        a.way === b.way
          ? a.name.localeCompare(b.name)
          : a.way === 'out'
            ? -1
            : 1,
      ),
    [categoryRows],
  );
  const sortedEntries = useMemo(
    () => [...entryRows].sort(newestFirst),
    [entryRows],
  );
  const currency = (own ?? defaultPreferences(ledger.userId)).currency;
  return useMemo(
    () => ({
      ready,
      accounts: sortedAccounts as Account[],
      categories: sortedCategories as Category[],
      entries: sortedEntries as Entry[],
      currency,
    }),
    [ready, sortedAccounts, sortedCategories, sortedEntries, currency],
  );
};

export type Money = ReturnType<typeof useMoney>;

/** Writes the user makes: each shows at once, and rolls back if refused. */
export const useWrites = () => {
  const ledger = useSession();
  return useMemo(
    () => ({
      addEntry: (entry: Omit<Entry, 'id' | 'userId' | 'createdAt'>) => {
        const id = crypto.randomUUID();
        ledger.entries.insert({
          ...entry,
          id,
          userId: ledger.userId,
          createdAt: new Date().toISOString(),
        });
        return id;
      },
      updateEntry: (id: string, changes: Partial<Entry>) =>
        ledger.entries.update(id, (draft) => {
          Object.assign(draft, changes);
        }),
      removeEntry: (id: string) => ledger.entries.delete(id),
      /** Brings back a deleted Entry, as it was. */
      restoreEntry: (entry: Entry) => ledger.entries.insert(entry),
      addAccount: (account: Pick<Account, 'name' | 'kind'>) => {
        const id = crypto.randomUUID();
        ledger.accounts.insert({
          ...account,
          id,
          userId: ledger.userId,
          createdAt: new Date().toISOString(),
        });
        return id;
      },
      renameAccount: (id: string, name: string) =>
        ledger.accounts.update(id, (draft) => {
          draft.name = name;
        }),
      setCurrency: (currency: string) => {
        if (ledger.preferences.has(ledger.userId)) {
          ledger.preferences.update(ledger.userId, (draft) => {
            draft.currency = currency;
          });
        } else {
          ledger.preferences.insert({ userId: ledger.userId, currency });
        }
      },
      sample: (entries: boolean) => ledger.sample(entries),
      clear: () => ledger.clear(),
    }),
    [ledger],
  );
};
