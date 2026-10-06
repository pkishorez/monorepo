import { Effect, Layer } from 'effect';
import { authLive } from '@kstackz/auth-toolkit/clients/auth';
import { IDB, type IDBTable } from '@kstackz/std-toolkit/db/idb';
import {
  browser,
  deleteStdSync,
  listStdSyncs,
} from '@kstackz/std-toolkit/sync/platform/browser';
import type { Backend } from '@ledger/core/client/settings';
import type { User } from '@ledger/core/client/session';
import {
  type DeviceDatabase,
  LedgerPlatform,
  type TableSource,
} from '@ledger/core/client/platform';
import { AUTH_URL } from './auth-url.ts';

// localStorage: the User last opened on this device, to open offline.
const LAST_USER = 'ledger:last-user';

const readLastUser = (): User | null => {
  try {
    const stored = localStorage.getItem(LAST_USER);
    return stored === null ? null : (JSON.parse(stored) as User);
  } catch {
    return null;
  }
};

// Each table opens once per tab, in the IndexedDB database it is kept in.
const tables = new Map<string, unknown>();
const table = <Name extends string>(
  source: TableSource<Name>,
  database: DeviceDatabase,
) => {
  const key = `${database}/${source.logicalName}`;
  const opened =
    (tables.get(key) as IDBTable<Name> | undefined) ??
    IDB.make(source, { database: IDB.database({ databaseName: database }) });
  tables.set(key, opened);
  return opened.layer;
};

// `?backend=local` or `?backend=remote` chooses the Backend, as Settings
// would, and leaves the address.
const launchBackend = (): Backend | null => {
  const url = new URL(window.location.href);
  const asked = url.searchParams.get('backend');
  if (asked !== 'local' && asked !== 'remote') return null;
  url.searchParams.delete('backend');
  window.history.replaceState(window.history.state, '', url.href);
  return asked;
};

const onOnlineChange = (changed: () => void) => {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
};

const onForeground = (shown: () => void) => {
  const changed = () => {
    if (document.visibilityState === 'visible') shown();
  };
  document.addEventListener('visibilitychange', changed);
  return () => document.removeEventListener('visibilitychange', changed);
};

/**
 * Ledger in a browser: tables in IndexedDB, Remote copies in IndexedDB
 * shared by every tab, the last User in `localStorage`, Google sign-in
 * through the Auth Worker's cookies, the Ledger API at this origin, and the
 * window's own network and visibility events. Made in the browser only.
 */
export const webPlatform = Layer.sync(LedgerPlatform, () => ({
  storage: {
    table,
    copies: browser(),
    listCopies: listStdSyncs,
    deleteCopy: (name: string) => deleteStdSync(name),
  },
  lastUser: {
    get: Effect.sync(readLastUser),
    set: (user: User | null) =>
      Effect.sync(() =>
        user === null
          ? localStorage.removeItem(LAST_USER)
          : localStorage.setItem(LAST_USER, JSON.stringify(user)),
      ),
  },
  remote: {
    auth: authLive({ authWorkerUrl: AUTH_URL }),
    ledgerUrl: window.location.origin,
    manageAccounts: async () => {
      window.open(AUTH_URL, '_blank', 'noopener');
    },
  },
  lifecycle: {
    online: () => navigator.onLine,
    onOnlineChange,
    onForeground,
    launchBackend,
  },
}));
