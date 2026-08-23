import { Effect, type Stream } from 'effect';
import type { DecodedEntity } from 'std-toolkit/core';
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
import type { BankApi, KeepSubscribed } from '../api/index.ts';
import type { BankRunner, Vitals } from '../diagnostics/index.ts';

const SYNC_VERSION = 1;

export interface BankSyncOptions {
  readonly api: BankApi;
  readonly keepSubscribed: KeepSubscribed;
  readonly name: string;
  readonly platform: StdSyncPlatform | undefined;
  readonly runner: BankRunner;
  readonly vitals: Vitals;
}

export const makeBankSync = ({
  api,
  keepSubscribed,
  name,
  platform,
  runner,
  vitals,
}: BankSyncOptions) => {
  const std = createStdSync({
    name,
    version: SYNC_VERSION,
    platform,
    runtime: runner,
    onEvent: (event) =>
      event._tag === 'LeadershipChanged'
        ? vitals.lead(event.collection, event.state)
        : Effect.logError(event),
  });

  const liveOldToNew = <T extends object>(
    subscribe: (
      cursor: DecodedEntity<T> | null,
    ) => Stream.Stream<ReadonlyArray<DecodedEntity<T>>, unknown>,
  ) => ({
    total: {
      strategy: syncStrategy.oldToNew<T>({
        source: ({ live }) =>
          live({
            open: ({ cursor }) => keepSubscribed(() => subscribe(cursor)),
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
      api.openAccount({ id: item.id, name: item.name, balance: item.balance }),
  });

  const transfers = std.collection({
    schema: TransferSchema,
    sync: liveOldToNew<Transfer>((cursor) =>
      api.subscribeAllTransfers({ '>': cursor }),
    ),
  });

  return { std, accounts, transfers };
};

export type BankSync = ReturnType<typeof makeBankSync>;
