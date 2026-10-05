import { useLiveQuery } from '@tanstack/react-db';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  type Account,
  type Category,
  defaultPreferences,
  type Entry,
  newestFirst,
  type Preferences,
} from '../../domain/ledger/index.ts';
import { type Ledger, type LedgerHost, openLedger } from './ledger.ts';

const LedgerContext = createContext<Ledger | undefined>(undefined);

/** Opens the user's Ledger for everything inside, and closes it after. */
export function LedgerProvider(props: {
  readonly userId: string;
  readonly host?: LedgerHost | undefined;
  readonly children: ReactNode;
}) {
  const [ledger, setLedger] = useState<Ledger>();
  useEffect(() => {
    const opened = openLedger(props.userId, props.host);
    setLedger(opened);
    return () => {
      void opened.dispose();
    };
  }, [props.userId, props.host]);
  if (ledger === undefined) return null;
  return <LedgerContext value={ledger}>{props.children}</LedgerContext>;
}

export const useLedger = () => {
  const ledger = useContext(LedgerContext);
  if (ledger === undefined)
    throw new Error('useLedger must be inside LedgerProvider');
  return ledger;
};

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

/**
 * The user's money as it stands, live: every Account, Category and Entry
 * (Entries newest first), their Preferences, and whether the first read
 * from this browser's copy is done.
 */
export const useMoney = () => {
  const ledger = useLedger();
  const accounts = useLiveQuery((q) => q.from({ row: ledger.accounts }));
  const categories = useLiveQuery((q) => q.from({ row: ledger.categories }));
  const entries = useLiveQuery((q) => q.from({ row: ledger.entries }));
  const preferences = useLiveQuery((q) => q.from({ row: ledger.preferences }));
  return useMemo(() => {
    const own = preferences.data[0];
    return {
      ready:
        accounts.isReady &&
        categories.isReady &&
        entries.isReady &&
        preferences.isReady,
      accounts: (accounts.data.map(plain) as Account[]).sort(
        (a, b) =>
          KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
          a.name.localeCompare(b.name),
      ),
      categories: (categories.data.map(plain) as Category[]).sort((a, b) =>
        a.way === b.way
          ? a.name.localeCompare(b.name)
          : a.way === 'out'
            ? -1
            : 1,
      ),
      entries: (entries.data.map(plain) as Entry[]).sort(newestFirst),
      preferences:
        own === undefined
          ? defaultPreferences(ledger.userId)
          : (plain(own) as Preferences),
    };
  }, [
    accounts.data,
    categories.data,
    entries.data,
    preferences.data,
    ledger.userId,
    accounts.isReady,
    categories.isReady,
    entries.isReady,
    preferences.isReady,
  ]);
};

export type Money = ReturnType<typeof useMoney>;

/** Writes the user makes: each shows at once, and rolls back if refused. */
export const useWrites = () => {
  const ledger = useLedger();
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
      setPreferences: (changes: Partial<Preferences>) => {
        if (ledger.preferences.has(ledger.userId)) {
          ledger.preferences.update(ledger.userId, (draft) => {
            Object.assign(draft, changes);
          });
        } else {
          ledger.preferences.insert({
            ...defaultPreferences(ledger.userId),
            ...changes,
          });
        }
      },
      sample: (entries: boolean) => ledger.sample(entries),
      clear: () => ledger.clear(),
    }),
    [ledger],
  );
};

const subscribeOnline = (changed: () => void) => {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
};

/** Whether the browser is online: writes need the server. */
export const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
