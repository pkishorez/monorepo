import { BTreeIndex } from '@tanstack/react-db';
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

const SYNC_VERSION = 2;
const TRANSFERS_GC_TIME = 5_000;

const deleteDatabase = (name: string): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess =
      request.onerror =
      request.onblocked =
        () => resume(Effect.void);
  });

const dropDatabases = (prefix: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (typeof indexedDB === 'undefined') return;
    const databases = yield* Effect.promise(() => indexedDB.databases());
    const names = databases.flatMap(({ name }) =>
      name?.startsWith(prefix) ? [name] : [],
    );
    yield* Effect.forEach(names, deleteDatabase, { discard: true });
  });

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
    strategy: syncStrategy.oldToNew<T>({
      source: ({ live }) =>
        live({
          open: ({ cursor }) => keepSubscribed(() => subscribe(cursor)),
        }),
    }),
  });

  const accounts = std.collection({
    schema: AccountSchema,
    sync: {
      total: liveOldToNew<Account>((cursor) =>
        api.subscribeAccounts({ '>': cursor }),
      ),
    },
    onInsert: (items) => api.openAccounts({ accounts: items }),
  });
  // A B-tree on the id lets the ledger page newest-first and look accounts up without
  // rescanning every row (seconds vs milliseconds at 1 lakh rows).
  accounts.createIndex((row) => row.id, { indexType: BTreeIndex });

  const transfers = std.collection({
    schema: TransferSchema,
    options: { gcTime: TRANSFERS_GC_TIME },
    sync: {
      partitions: {
        from: (from) =>
          liveOldToNew<Transfer>((cursor) =>
            api.subscribeTransfersFrom({ from, '>': cursor }),
          ),
        to: (to) =>
          liveOldToNew<Transfer>((cursor) =>
            api.subscribeTransfersTo({ to, '>': cursor }),
          ),
      },
    },
  });

  const forget: Effect.Effect<void> = Effect.promise(() => std.dispose()).pipe(
    Effect.andThen(dropDatabases(`std-sync:${name}`)),
    Effect.withSpan('Forget the sync replica'),
  );

  return { std, accounts, transfers, forget };
};

export type BankSync = ReturnType<typeof makeBankSync>;
