import { Effect, Layer, Stream } from 'effect';
import { IDB } from 'std-toolkit/db/idb';
import { Memory } from 'std-toolkit/db/memory';
import { browser } from 'std-toolkit/sync/platform/browser';
import { bankTable } from '../../std-table/table/index.ts';
import { BankSubscriptionsLive } from '../subscriptions/in-memory/index.ts';
import { durableObjectProtocol, loopbackProtocol } from './protocol.ts';
import { BankWiring, runBank, type BankRuntime } from './runtime.ts';

export { newId, type BankRuntime } from './runtime.ts';
export type { NetworkQuality } from './network.ts';

const identitySubscribed = <A, E, R>(
  subscribe: () => Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R> => subscribe();

const bootOnce = (
  wiring: Layer.Layer<BankWiring, unknown>,
): (() => Promise<BankRuntime>) => {
  let runtime: Promise<BankRuntime> | undefined;
  return () =>
    (runtime ??= runBank(wiring).then(async (bank) => {
      await Promise.all([bank.accounts.preload(), bank.transfers.preload()]);
      return bank;
    }));
};

const MemoryWiring = Layer.succeed(BankWiring, {
  protocolLayer: loopbackProtocol(
    Memory.make(bankTable).layer,
    BankSubscriptionsLive,
    'http://bank.local/rpc/memory',
  ),
  keepSubscribed: identitySubscribed,
  syncName: 'bank-memory',
});

const IdbWiring = Layer.effect(
  BankWiring,
  Effect.gen(function* () {
    const table = IDB.make(bankTable, {
      database: IDB.database({ databaseName: 'bank-demo-v3' }),
    });
    yield* table.setup;
    return {
      protocolLayer: loopbackProtocol(
        table.layer,
        BankSubscriptionsLive,
        'http://bank.local/rpc/idb',
      ),
      keepSubscribed: identitySubscribed,
      syncName: 'bank-idb',
      platform: browser(),
    };
  }),
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

const DurableObjectWiring = (
  envKey: 'VITE_BANK_SQLITE_DO_URL' | 'VITE_BANK_DYNAMO_DO_URL',
  syncName: string,
): Layer.Layer<BankWiring, unknown> =>
  Layer.effect(
    BankWiring,
    Effect.gen(function* () {
      const url = import.meta.env[envKey];
      if (!url) {
        return yield* Effect.fail(
          new Error(`${envKey} is not set — deploy wires it in infra.`),
        );
      }
      const { protocolLayer, keepSubscribed, connectionStatus } =
        yield* durableObjectProtocol(adminUrl(url));
      return {
        protocolLayer,
        keepSubscribed,
        connectionStatus,
        syncName,
        platform: browser(),
      };
    }),
  );

const SqliteWiring = DurableObjectWiring(
  'VITE_BANK_SQLITE_DO_URL',
  'bank-sqlite',
);
const DynamoWiring = DurableObjectWiring(
  'VITE_BANK_DYNAMO_DO_URL',
  'bank-dynamo',
);

export const memoryBank = bootOnce(MemoryWiring);
export const idbBank = bootOnce(IdbWiring);
export const sqliteBank = bootOnce(SqliteWiring);
export const dynamoBank = bootOnce(DynamoWiring);
