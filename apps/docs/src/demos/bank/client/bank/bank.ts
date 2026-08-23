import { Effect, Scope } from 'effect';
import { makeAdmin, type Admin } from '../admin/index.ts';
import { connectBankApi, type BankApi } from '../api/index.ts';
import {
  makeNetwork,
  makeTracing,
  makeVitals,
  quietRunner,
  type Network,
  type Vitals,
} from '../diagnostics/index.ts';
import type { TraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { makeBankSync, type BankSync } from '../sync/index.ts';
import {
  bankStores,
  type BankStore,
  type BankStoreKey,
} from '../stores/index.ts';
import { makeTransfers, type Transfers } from '../transfers/index.ts';

export interface BankRuntime {
  readonly accounts: BankSync['accounts'];
  readonly transfers: BankSync['transfers'];
  readonly send: Transfers['send'];
  readonly attempts: Transfers['attempts'];
  readonly retry: Transfers['retry'];
  /** Null for guests: admin acts exist only where the role allows them. */
  readonly admin: Admin | null;
  readonly diagnostics: {
    readonly network: Network;
    readonly vitals: Vitals;
    readonly recorder: TraceRecorder;
  };
}

const makeBank = (
  store: BankStore,
): Effect.Effect<BankRuntime, never, Scope.Scope> =>
  Effect.gen(function* () {
    const api: BankApi = yield* connectBankApi(store.connection);
    const session = yield* api.session().pipe(Effect.orDie);
    const { recorder, runner } = makeTracing();
    const network = makeNetwork();
    const vitals = makeVitals(store.connection.connectionStatus !== null);
    if (store.connection.connectionStatus !== null)
      yield* Effect.forkScoped(
        vitals.followConnection(store.connection.connectionStatus),
      );

    const sync = makeBankSync({
      api,
      keepSubscribed: store.connection.keepSubscribed,
      name: `${store.syncName}-g${session.generation}`,
      platform: store.platform,
      runner,
      vitals,
    });
    const transfers = makeTransfers({ api, sync, network, vitals, runner });
    const admin =
      session.role === 'admin'
        ? makeAdmin({ api, sync, syncName: store.syncName, runner })
        : null;

    return {
      accounts: sync.accounts,
      transfers: sync.transfers,
      send: transfers.send,
      attempts: transfers.attempts,
      retry: transfers.retry,
      admin,
      diagnostics: { network, vitals, recorder },
    };
  });

const bootOnce = (
  store: Effect.Effect<BankStore, unknown, Scope.Scope>,
): (() => Promise<BankRuntime>) => {
  let booted: Promise<BankRuntime> | undefined;
  return () =>
    (booted ??= quietRunner.runPromise(
      Effect.flatMap(store, makeBank).pipe(
        Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
      ),
    ));
};

/** One memoized runtime per store — booting twice returns the same bank. */
export const bank: Record<BankStoreKey, () => Promise<BankRuntime>> = {
  idb: bootOnce(bankStores.idb),
  sqlite: bootOnce(bankStores.sqlite),
  dynamo: bootOnce(bankStores.dynamo),
};
