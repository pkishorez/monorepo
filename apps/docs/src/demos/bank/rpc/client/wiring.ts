import { createOptimisticAction } from '@tanstack/react-db';
import { Effect, Layer, Schedule, Scope } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { RpcClient } from 'effect/unstable/rpc';
import { nextUlid } from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import {
  createStdSync,
  syncStrategy,
  type LeadershipLayer,
  type SyncStoreLayer,
} from 'std-toolkit/sync';
import { AccountSchema, type Account } from '../../contract/account/index.ts';
import {
  TransferSchema,
  type Transfer,
} from '../../contract/transfer/index.ts';
import {
  BANK_RPC_PATH,
  BankRpcSerializationLayer,
  BankRpcs,
} from '../contract/index.ts';
import { makeBankFetch } from '../handlers/index.ts';
import { makeNetwork } from './network.ts';

type BankTableLayer = Layer.Layer<StdTableService<'bank'>>;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface SendMoneyInput {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export interface OpenAccountInput {
  readonly id: string;
  readonly name: string;
}

export interface BankWiring {
  readonly fetchImpl: FetchLike;
  readonly url: string;
  readonly syncName: string;
  readonly storeLayer: SyncStoreLayer | undefined;
  readonly leadershipLayer: LeadershipLayer;
}

const LOCAL_RPC_URL = `http://bank.local${BANK_RPC_PATH}`;

export const salt = () => crypto.randomUUID().slice(0, 8);

export const newId = (): string => Effect.runSync(nextUlid);

export const loopback = (
  table: BankTableLayer,
): Pick<BankWiring, 'fetchImpl' | 'url'> => {
  const handle = makeBankFetch(table);
  return {
    fetchImpl: (input, init) => handle(new Request(input, init)),
    url: LOCAL_RPC_URL,
  };
};

const protocolLayer = (wiring: BankWiring) =>
  RpcClient.layerProtocolHttp({ url: wiring.url }).pipe(
    Layer.provide([
      FetchHttpClient.layer.pipe(
        Layer.provide(
          Layer.succeed(
            FetchHttpClient.Fetch,
            wiring.fetchImpl as typeof globalThis.fetch,
          ),
        ),
      ),
      BankRpcSerializationLayer,
    ]),
  );

export const makeBank = (wiring: Effect.Effect<BankWiring, unknown>) =>
  Effect.gen(function* () {
    const resolved = yield* wiring;
    const api = yield* RpcClient.make(BankRpcs).pipe(
      Effect.provide(protocolLayer(resolved)),
    );
    const network = makeNetwork();

    const std = createStdSync({
      name: resolved.syncName,
      storeLayer: resolved.storeLayer,
      leadershipLayer: resolved.leadershipLayer,
    });

    const accounts = std.collection({
      schema: AccountSchema,
      sync: {
        total: {
          strategy: syncStrategy.oldToNew<Account>({
            source: ({ poll }) =>
              poll({
                fetch: ({ cursor }) => api.listAccounts({ cursor }),
                schedule: Schedule.spaced('1 second'),
              }),
          }),
        },
      },
      onInsert: (item) => api.openAccount({ id: item.id, name: item.name }),
    });

    const transfers = std.collection({
      schema: TransferSchema,
      sync: {
        total: {
          strategy: syncStrategy.oldToNew<Transfer>({
            source: ({ poll }) =>
              poll({
                fetch: ({ cursor }) => api.listAllTransfers({ cursor }),
                schedule: Schedule.spaced('1 second'),
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

    const seed = (): Promise<boolean> => Effect.runPromise(api.seed());

    return { api, accounts, transfers, std, network, sendMoney, seed };
  });

export type BankRuntime = Effect.Success<ReturnType<typeof makeBank>>;

export type BankApi = BankRuntime['api'];

export const runBank = (
  wiring: Effect.Effect<BankWiring, unknown>,
): Promise<BankRuntime> =>
  Effect.runPromise(
    makeBank(wiring).pipe(
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  );
