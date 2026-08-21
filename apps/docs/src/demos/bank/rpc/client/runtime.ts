import { createOptimisticAction } from '@tanstack/react-db';
import { Effect, Layer, Scope, Stream } from 'effect';
import { RpcClient } from 'effect/unstable/rpc';
import { nextUlid } from 'std-toolkit/core';
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
import { makeNetwork } from './network.ts';

export const newId = (): string => Effect.runSync(nextUlid);

interface SendMoneyInput {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export interface BankWiring {
  readonly protocolLayer: Layer.Layer<RpcClient.Protocol>;
  readonly keepSubscribed: <A, E, R>(
    subscribe: () => Stream.Stream<A, E, R>,
  ) => Stream.Stream<A, E, R>;
  readonly syncName: string;
  readonly platform?: StdSyncPlatform;
}

const makeBank = (wiring: Effect.Effect<BankWiring, unknown, Scope.Scope>) =>
  Effect.gen(function* () {
    const resolved = yield* wiring;
    const api = yield* RpcClient.make(BankRpcs).pipe(
      Effect.provide(resolved.protocolLayer),
    );
    const network = makeNetwork();

    const std = createStdSync({
      name: resolved.syncName,
      platform: resolved.platform,
    });

    const accounts = std.collection({
      schema: AccountSchema,
      sync: {
        total: {
          strategy: syncStrategy.oldToNew<Account>({
            source: ({ live }) =>
              live({
                open: ({ cursor }) =>
                  resolved
                    .keepSubscribed(() =>
                      api.subscribeAccounts({ '>': cursor }),
                    )
                    .pipe(Stream.map((item) => [item] as const)),
              }),
          }),
        },
      },
      onInsert: (item) =>
        api.openAccount({
          id: item.id,
          name: item.name,
          balance: item.balance,
        }),
    });

    const transfers = std.collection({
      schema: TransferSchema,
      sync: {
        total: {
          strategy: syncStrategy.oldToNew<Transfer>({
            source: ({ live }) =>
              live({
                open: ({ cursor }) =>
                  resolved
                    .keepSubscribed(() =>
                      api.subscribeAllTransfers({ '>': cursor }),
                    )
                    .pipe(Stream.map((item) => [item] as const)),
              }),
          }),
        },
      },
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
        Effect.runPromise(
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

export type BankRuntime = Effect.Success<ReturnType<typeof makeBank>>;

export const runBank = (
  wiring: Effect.Effect<BankWiring, unknown, Scope.Scope>,
): Promise<BankRuntime> =>
  Effect.runPromise(
    makeBank(wiring).pipe(
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  );
