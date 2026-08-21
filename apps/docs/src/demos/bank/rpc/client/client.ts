import { Effect, Scope, Stream } from 'effect';
import { IDB } from 'std-toolkit/db/idb';
import { Memory } from 'std-toolkit/db/memory';
import { browser } from 'std-toolkit/sync/platform/browser';
import { bankTable } from '../../std-table/table/index.ts';
import { BANK_RPC_PATH } from '../contract/index.ts';
import { BankSubscriptionsLive } from '../subscriptions/in-memory/index.ts';
import {
  durableObjectProtocol,
  httpProtocol,
  loopbackProtocol,
} from './protocol.ts';
import { runBank, type BankRuntime, type BankWiring } from './runtime.ts';

export { newId, type BankRuntime } from './runtime.ts';
export type { NetworkQuality } from './network.ts';

const identitySubscribed = <A, E, R>(
  subscribe: () => Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R> => subscribe();

const bootOnce = (
  wiring: Effect.Effect<BankWiring, unknown, Scope.Scope>,
): (() => Promise<BankRuntime>) => {
  let runtime: Promise<BankRuntime> | undefined;
  return () => (runtime ??= runBank(wiring));
};

const memoryWiring: Effect.Effect<BankWiring> = Effect.sync(() => ({
  protocolLayer: loopbackProtocol(
    Memory.make(bankTable).layer,
    BankSubscriptionsLive,
    'http://bank.local/rpc/memory',
  ),
  keepSubscribed: identitySubscribed,
  syncName: 'bank-memory',
}));

const idbWiring = Effect.gen(function* () {
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
  } satisfies BankWiring;
});

const httpWiring: Effect.Effect<BankWiring> = Effect.sync(() => ({
  protocolLayer: httpProtocol(BANK_RPC_PATH),
  keepSubscribed: identitySubscribed,
  syncName: 'bank-dynamo',
  platform: browser(),
}));

const durableObjectWiring: Effect.Effect<BankWiring, unknown, Scope.Scope> =
  Effect.gen(function* () {
    const bankDoUrl = import.meta.env.VITE_BANK_DO_URL;
    if (!bankDoUrl) {
      return yield* Effect.fail(
        new Error('VITE_BANK_DO_URL is not set — deploy wires it in infra.'),
      );
    }
    const { protocolLayer, keepSubscribed } =
      yield* durableObjectProtocol(bankDoUrl);
    return {
      protocolLayer,
      keepSubscribed,
      syncName: 'bank-do',
      platform: browser(),
    };
  });

export const memoryBank = bootOnce(memoryWiring);
export const idbBank = bootOnce(idbWiring);
export const httpBank = bootOnce(httpWiring);
export const durableObjectBank = bootOnce(durableObjectWiring);
