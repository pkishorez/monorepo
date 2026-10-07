import { authLive } from '@kstackz/auth-toolkit/clients/auth/live';
import type { AppPlatform, TableSource } from '@kstackz/auth-toolkit/app';
import { IDB, type IDBTable } from '@kstackz/std-toolkit/db/idb';
import {
  browser,
  deleteStdSync,
  listStdSyncs,
} from '@kstackz/std-toolkit/sync/platform/browser';
import { webGatePlatform } from './gate.ts';

/**
 * A web app's platform, for auth-toolkit's `createApp`: each table in the
 * IndexedDB database it names, Std Sync in IndexedDB shared by every tab,
 * cloud sign-in through the sign-in service at `authUrl` and its cookies, the cloud API at this origin, and the Gate's
 * memory in `localStorage` under `name`, with the device's network,
 * visibility and other tabs. Made in the browser only: pass it as a
 * function.
 */
export const webPlatform = (options: {
  readonly name: string;
  readonly authUrl: string;
}): AppPlatform['Service'] => {
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
  return {
    table,
    sync: {
      ...browser(),
      list: listStdSyncs,
      remove: (name) => deleteStdSync(name),
    },
    cloud: {
      auth: authLive({ authWorkerUrl: options.authUrl }),
      url: window.location.origin,
      manageAccounts: async () => {
        window.open(options.authUrl, '_blank', 'noopener');
      },
    },
    gate: webGatePlatform(options.name),
  };
};
