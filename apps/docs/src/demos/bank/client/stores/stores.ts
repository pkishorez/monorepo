import { Effect, Scope } from 'effect';
import { IDB } from 'std-toolkit/db/idb';
import { browser } from 'std-toolkit/sync/platform/browser';
import type { StdSyncPlatform } from 'std-toolkit/sync';
import { makeBankServer, makeBankWebHandler } from '../../server/index.ts';
import { bankTable } from '../../std-table/table/index.ts';
import {
  loopbackConnection,
  webSocketConnection,
  type BankConnection,
} from '../api/index.ts';

export interface BankStore {
  readonly syncName: string;
  readonly connection: BankConnection;
  readonly platform: StdSyncPlatform | undefined;
}

export type BankStoreKey = 'idb' | 'sqlite' | 'dynamo';

const IDB_DATABASE = 'bank-demo-v3';

/** The browser hosts its own bank: an IndexedDB table behind an in-process server where everyone is admin. */
const idbStore: Effect.Effect<BankStore, unknown, Scope.Scope> = Effect.gen(
  function* () {
    const table = IDB.make(bankTable, {
      database: IDB.database({ databaseName: IDB_DATABASE }),
    });
    yield* table.setup;
    const server = makeBankServer({
      table: table.layer,
      checkpoint: false,
      role: 'admin',
    });
    return {
      syncName: 'bank-idb',
      connection: loopbackConnection(
        makeBankWebHandler(server),
        'http://bank.local/rpc/idb',
      ),
      platform: browser(),
    };
  },
);

const ADMIN_KEY = 'bank-admin-key';

const adminUrl = (url: string): string => {
  const fromSearch = new URLSearchParams(location.search).get('admin');
  if (fromSearch) localStorage.setItem(ADMIN_KEY, fromSearch);
  const key = fromSearch ?? localStorage.getItem(ADMIN_KEY);
  if (!key) return url;
  const target = new URL(url);
  target.searchParams.set('admin', key);
  return target.toString();
};

/** A bank hosted in a Durable Object, reached over WebSocket; admin only with the key. */
const remoteStore = (
  envKey: 'VITE_BANK_SQLITE_DO_URL' | 'VITE_BANK_DYNAMO_DO_URL',
  syncName: string,
): Effect.Effect<BankStore, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const url = import.meta.env[envKey];
    if (!url)
      return yield* Effect.fail(
        new Error(`${envKey} is not set — deploy wires it in infra.`),
      );
    return {
      syncName,
      connection: yield* webSocketConnection(adminUrl(url)),
      platform: browser(),
    };
  });

export const bankStores: Record<
  BankStoreKey,
  Effect.Effect<BankStore, unknown, Scope.Scope>
> = {
  idb: idbStore,
  sqlite: remoteStore('VITE_BANK_SQLITE_DO_URL', 'bank-sqlite'),
  dynamo: remoteStore('VITE_BANK_DYNAMO_DO_URL', 'bank-dynamo'),
};
