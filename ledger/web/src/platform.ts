import {
  type Backend,
  backendNamed,
  type Platform,
  type TableSource,
  type TabMessage,
} from '@kstackz/auth-toolkit/client';
import { cookie } from '@kstackz/auth-toolkit/client/web';
import { IDB, type IDBTable } from '@kstackz/std-toolkit/db/idb';
import { Sync } from '@kstackz/std-toolkit/sync/idb';

// Lifted from web-toolkit's former `webPlatform`, until web-toolkit gives a
// Platform on the new doors again (ADR 0005).

// `?backend=device` or `?backend=cloud` (or their former names, `local` and
// `remote`) chooses the Backend, as Settings would, and leaves the address.
const launchBackend = (): Backend | null => {
  const url = new URL(window.location.href);
  const asked = backendNamed(url.searchParams.get('backend'));
  if (asked === null) return null;
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
 * Ledger's Platform in a browser: each table in the IndexedDB database it
 * names, Std Sync in IndexedDB shared by every tab, cloud sign-in through
 * the sign-in service at `authUrl` and its cookies, the cloud API at this
 * origin, and the window's network, visibility and other tabs under `name`.
 * Made in the browser only: pass it as a function.
 */
export const webPlatform = (options: {
  readonly name: string;
  readonly authUrl: string;
}): Platform => {
  // Each table opens once per tab, in the database it is kept in.
  const tables = new Map<string, unknown>();
  const table = <Name extends string>(
    source: TableSource<Name>,
    database: string,
  ) => {
    const key = `${database}/${source.logicalName}`;
    const opened =
      (tables.get(key) as IDBTable<Name> | undefined) ??
      IDB.make(source, { database: IDB.database({ databaseName: database }) });
    tables.set(key, opened);
    return opened.layer;
  };
  const channel = new BroadcastChannel(`${options.name}:gate`);
  return {
    storage: {
      table,
      sync: {
        ...Sync.idb(),
        list: () => Sync.idb.list(),
        remove: (name) => Sync.idb.remove(name),
      },
    },
    cloud: {
      signIn: cookie({ authWorkerUrl: options.authUrl }),
      url: window.location.origin,
      manageAccounts: async () => {
        window.open(options.authUrl, '_blank', 'noopener');
      },
    },
    lifecycle: {
      online: () => navigator.onLine,
      onOnlineChange,
      onForeground,
      launchBackend,
    },
    tabs: {
      announce: (message) => channel.postMessage(message),
      listen: (heard) => {
        const listener = (event: MessageEvent<TabMessage>) => heard(event.data);
        channel.addEventListener('message', listener);
        return () => channel.removeEventListener('message', listener);
      },
    },
  };
};
