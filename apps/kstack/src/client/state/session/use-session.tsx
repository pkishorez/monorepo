import { useLiveQuery } from '@tanstack/react-db';
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import {
  type Account,
  type Category,
  defaultPreferences,
  type Entry,
  newestFirst,
  type Preferences,
} from '../../../shared/ledger/index.ts';
import type { Session } from '../../domain/session/index.ts';

const SessionContext = createContext<Session | undefined>(undefined);

/** Gives everything inside the open Session; it never changes User. */
export function SessionProvider(props: {
  readonly session: Session;
  readonly children: ReactNode;
}) {
  return (
    <SessionContext value={props.session}>{props.children}</SessionContext>
  );
}

/** The open Session; only inside a SessionProvider. */
export const useSession = () => {
  const session = useContext(SessionContext);
  if (session === undefined)
    throw new Error('useSession must be inside SessionProvider');
  return session;
};

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

/**
 * The user's money as it stands, live: every Account, Category and Entry
 * (Entries newest first), their currency, and whether the first read
 * from this browser's copy is done.
 */
export const useMoney = () => {
  const ledger = useSession();
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
      currency: (own === undefined
        ? defaultPreferences(ledger.userId)
        : (plain(own) as Preferences)
      ).currency,
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
