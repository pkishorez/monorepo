import type { TabMessage } from '@kstackz/platform-toolkit';
import {
  type Backend,
  backendNamed,
  type Host,
  keptBroadcasters,
  type TableSource,
} from '@kstackz/platform-toolkit';
import { cookie } from '@kstackz/auth-toolkit/client/web';
import { sharedBroadcaster } from '@kstackz/std-toolkit/core';
import { IDB, type IDBTable } from '@kstackz/std-toolkit/db/idb';
import { Sync } from '@kstackz/std-toolkit/sync/idb';

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
 * The browser as an app's Host: each table in the IndexedDB database it
 * names, heard by every tab, Std Sync in IndexedDB shared by every tab, the cloud APIs at this
 * origin, sign-in through the sign-in service at `authUrl` and its cookies
 * when the app has auth, and the window's network, visibility and other
 * tabs under `name`. Made in the browser only.
 */
export const webHost = (options: {
  readonly name: string;
  readonly authUrl?: string | undefined;
}): Host => {
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
  const { authUrl } = options;
  return {
    storage: {
      table,
      // Every tab writes to the same IndexedDB database, so each hears the
      // others' writes.
      broadcaster: keptBroadcasters(sharedBroadcaster),
      sync: {
        ...Sync.idb(),
        list: () => Sync.idb.list(),
        remove: (name) => Sync.idb.remove(name),
      },
    },
    cloud: {
      url: window.location.origin,
      ...(authUrl !== undefined && {
        signIn: cookie({ authWorkerUrl: authUrl }),
        manageAccounts: async () => {
          window.open(authUrl, '_blank', 'noopener');
        },
      }),
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
