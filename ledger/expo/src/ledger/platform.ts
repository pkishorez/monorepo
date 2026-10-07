import { Effect } from 'effect';
import { createURL, getLinkingURL } from 'expo-linking';
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from 'expo-network';
import {
  openDatabaseSync,
  type SQLiteBindValue,
  type SQLiteDatabase,
} from 'expo-sqlite';
import { AppState } from 'react-native';
import {
  type Backend,
  backendNamed,
  type Platform,
  type TableSource,
} from '@kstackz/auth-toolkit/client';
import { manageAccounts, oauth } from '@kstackz/auth-toolkit/client/expo';
import { SQLite, type SQLiteDriver } from '@kstackz/std-toolkit/db/sqlite';
import { makeExpoSQLite } from '@kstackz/std-toolkit/db/sqlite/expo';
import { Sync } from '@kstackz/std-toolkit/sync/sqlite';

// Lifted from expo-platform's former `expoPlatform`, until expo-platform gives
// a Platform on the new doors again (ADR 0005).

// One SQLite file per database, as the web keeps one IndexedDB database
// each, and one more for Std Sync.
const open = (name: string): SQLiteDatabase => {
  const database = openDatabaseSync(`${name}.db`);
  database.execSync('PRAGMA journal_mode = WAL');
  // Guarded writes run on a second connection (std-toolkit's Expo driver);
  // a write here waits for its lock instead of failing "database is locked".
  database.execSync('PRAGMA busy_timeout = 5000');
  return database;
};

// A row as setup reads it: table and index details.
type SQLiteRow = Readonly<Record<string, string | number | null>>;

// expo-sqlite's synchronous calls, for setting a table up: std-toolkit's
// Expo driver is async, and setup only creates tables and indexes.
const setupDriver = (database: SQLiteDatabase): SQLiteDriver => ({
  run: (sql, parameters = []) =>
    Effect.try(() => ({
      changes: database.runSync(sql, parameters as SQLiteBindValue[]).changes,
    })),
  all: (sql, parameters = []) =>
    Effect.try(() =>
      database.getAllSync<SQLiteRow>(sql, parameters as SQLiteBindValue[]),
    ),
  transaction: (statements) =>
    Effect.try(() =>
      database.withTransactionSync(() => {
        for (const { sql, parameters = [] } of statements)
          database.runSync(sql, parameters as SQLiteBindValue[]);
      }),
    ),
});

/**
 * Where this phone keeps things: each table in its database's SQLite file,
 * opened on first use and set up once, and Std Sync in `copies.db`, each
 * sync in a table of its own.
 */
const makeStorage = (): Platform['storage'] => {
  const databases = new Map<string, SQLiteDatabase>();
  const database = (name: string) => {
    const opened = databases.get(name) ?? open(name);
    databases.set(name, opened);
    return opened;
  };
  const copies = open('copies');

  // Each table is set up once per launch, the first time it is asked for,
  // and synchronously: Layers are built with `runSync`, as IndexedDB's open
  // on the web allows.
  const ready = new Set<string>();
  const table = <Name extends string>(
    source: TableSource<Name>,
    name: string,
  ) => {
    const opened = database(name);
    const key = `${name}/${source.logicalName}`;
    if (!ready.has(key)) {
      Effect.runSync(SQLite.setup(source, { database: setupDriver(opened) }));
      ready.add(key);
    }
    return SQLite.make(source, {
      database: makeExpoSQLite({ database: opened }),
    }).layer;
  };

  return {
    table,
    sync: {
      ...Sync.sqlite({ database: copies }),
      list: () => Sync.sqlite.list(copies),
      remove: (name) => Sync.sqlite.remove(copies, name),
    },
  };
};

// A link that opened the app with `?backend=device` or `?backend=cloud` (or
// their former names) chooses the Backend, as the address does on the web:
// how an agent starts an app on the device Backend.
const launchBackend = (): Backend | null =>
  backendNamed(/[?&]backend=(\w+)/.exec(getLinkingURL() ?? '')?.[1]);

/**
 * When the app is online and in view: the network from expo-network, the
 * foreground from AppState. Online until the network says otherwise, so a
 * launch never starts offline while the first answer is on its way.
 */
const makeLifecycle = (): Platform['lifecycle'] => {
  let online = true;
  const listeners = new Set<() => void>();
  const take = (state: NetworkState) => {
    const now = state.isConnected !== false;
    if (now === online) return;
    online = now;
    listeners.forEach((changed) => changed());
  };
  void getNetworkStateAsync().then(take, () => {});
  addNetworkStateListener(take);

  return {
    online: () => online,
    onOnlineChange: (changed) => {
      listeners.add(changed);
      return () => void listeners.delete(changed);
    },
    onForeground: (shown) => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') shown();
      });
      return () => subscription.remove();
    },
    launchBackend,
  };
};

/**
 * Ledger's Platform on a phone: each table in an expo-sqlite file of its
 * database's name, Std Sync in `copies.db`, cloud sign-in as the app's
 * First-Party Client (`clientId`) in the system sign-in sheet with each
 * user's tokens in secure storage, the cloud API at `apiUrl`, and the
 * network from expo-network and the foreground from AppState. One app, so
 * no other tabs. Made on first use: pass it as a function.
 */
export const expoPlatform = (options: {
  readonly name: string;
  /** Where the cloud Backend's API answers. */
  readonly apiUrl: string;
  /** The sign-in service. */
  readonly authUrl: string;
  /** The app's First-Party Client at the sign-in service. */
  readonly clientId: string;
  /** The audience the cloud API checks an Access Token for. */
  readonly resource: string;
}): Platform => ({
  storage: makeStorage(),
  cloud: {
    signIn: oauth({
      authWorkerUrl: options.authUrl,
      clientId: options.clientId,
      // `<scheme>://oauth/callback` in a development or release build;
      // `exp://<metro host>/--/oauth/callback` in Expo Go.
      redirectUri: createURL('oauth/callback'),
      resource: options.resource,
      storageKey: `${options.name}.auth`,
    }),
    url: options.apiUrl,
    manageAccounts: () => manageAccounts(options.authUrl),
  },
  lifecycle: makeLifecycle(),
});
