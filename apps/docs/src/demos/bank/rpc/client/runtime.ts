import { createOptimisticAction } from '@tanstack/react-db';
import { Context, Effect, Layer, References, Scope, Stream } from 'effect';
import { RpcClient } from 'effect/unstable/rpc';
import { nextUlid, type DecodedEntity } from 'std-toolkit/core';
import {
  createStdSync,
  syncStrategy,
  type StdSyncPlatform,
} from 'std-toolkit/sync';
import { AccountSchema, type Account } from '../../contract/account/index.ts';
import {
  TransferSchema,
  type Transfer,
} from '../../contract/transfer/index.ts';
import { seedBalance, seedNames, SEED_SIZE } from '../mutations/index.ts';
import { BankRpcs } from '../contract/index.ts';
import { Network, NetworkLive } from './network.ts';

export const newId = (): string => Effect.runSync(nextUlid);

const quiet = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.provideService(effect, References.MinimumLogLevel, 'Warning');

const quietRuntime = {
  runPromise: <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromise(quiet(effect)),
  runSync: <A, E>(effect: Effect.Effect<A, E>): A =>
    Effect.runSync(quiet(effect)),
};

interface SendMoneyInput {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export class BankWiring extends Context.Service<
  BankWiring,
  {
    readonly protocolLayer: Layer.Layer<RpcClient.Protocol>;
    readonly keepSubscribed: <A, E, R>(
      subscribe: () => Stream.Stream<A, E, R>,
    ) => Stream.Stream<A, E, R>;
    readonly syncName: string;
    readonly platform?: StdSyncPlatform;
  }
>()('BankWiring') {}

const makeApi = Effect.gen(function* () {
  const { protocolLayer } = yield* BankWiring;
  return yield* RpcClient.make(BankRpcs).pipe(Effect.provide(protocolLayer));
});

export class BankApi extends Context.Service<
  BankApi,
  Effect.Success<typeof makeApi>
>()('BankApi') {}

const BankApiLive = Layer.effect(BankApi, makeApi);

const makeBank = Effect.gen(function* () {
  const { keepSubscribed, syncName, platform } = yield* BankWiring;
  const api = yield* BankApi;
  const network = yield* Network;

  const std = createStdSync({
    name: syncName,
    platform,
    runtime: quietRuntime,
  });

  const liveOldToNew = <T extends object>(
    subscribe: (
      cursor: DecodedEntity<T> | null,
    ) => Stream.Stream<DecodedEntity<T>, unknown>,
  ) => ({
    total: {
      strategy: syncStrategy.oldToNew<T>({
        source: ({ live }) =>
          live({
            open: ({ cursor }) =>
              keepSubscribed(() => subscribe(cursor)).pipe(
                Stream.map((item) => [item] as const),
              ),
          }),
      }),
    },
  });

  const accounts = std.collection({
    schema: AccountSchema,
    sync: liveOldToNew<Account>((cursor) =>
      api.subscribeAccounts({ '>': cursor }),
    ),
    onInsert: (item) =>
      api.openAccount({
        id: item.id,
        name: item.name,
        balance: item.balance,
      }),
  });

  const transfers = std.collection({
    schema: TransferSchema,
    sync: liveOldToNew<Transfer>((cursor) =>
      api.subscribeAllTransfers({ '>': cursor }),
    ),
  });

  const sendMoney = createOptimisticAction<SendMoneyInput>({
    onMutate: ({ id, from, to, amount }) => {
      accounts.update(from, (draft) => {
        draft.balance -= amount;
      });
      accounts.update(to, (draft) => {
        draft.balance += amount;
      });
      transfers.insert({ id, from, to, amount });
    },
    mutationFn: (input) =>
      quietRuntime.runPromise(
        network.travel.pipe(
          Effect.flatMap(() => api.transfer(input)),
          Effect.tap((outcome) =>
            Effect.all([
              accounts.utils.applyToSyncReplica([...outcome.accounts]),
              transfers.utils.applyToSyncReplica([outcome.transfer]),
            ]),
          ),
        ),
      ),
  });

  const seed = (): void => {
    accounts.insert(
      seedNames(SEED_SIZE).map((name) => ({
        id: newId(),
        name,
        balance: seedBalance(),
      })),
    );
  };

  return { api, accounts, transfers, std, network, sendMoney, seed };
});

export type BankRuntime = Effect.Success<typeof makeBank>;

export const runBank = (
  wiring: Layer.Layer<BankWiring, unknown>,
): Promise<BankRuntime> =>
  quietRuntime.runPromise(
    Effect.gen(function* () {
      const services = yield* Layer.build(
        Layer.mergeAll(BankApiLive, NetworkLive).pipe(
          Layer.provideMerge(wiring),
        ),
      );
      return yield* Effect.provide(makeBank, services);
    }).pipe(Effect.provideService(Scope.Scope, Scope.makeUnsafe())),
  );
