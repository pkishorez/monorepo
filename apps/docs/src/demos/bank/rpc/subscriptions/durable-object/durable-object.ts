import { Effect, Option, Stream } from 'effect';
import { StreamCheckpoint } from '@pkishorez/effect-cloudflare/hibernating-rpc';
import type { StdTableService } from 'std-toolkit/db';
import {
  AccountEntity,
  BankSubscriptions,
  TransferEntity,
  type TransferDirection,
} from '../../contract/index.ts';
import type { AccountRow } from '../../../std-table/entities/account/index.ts';
import type { TransferRow } from '../../../std-table/entities/transfer/index.ts';
import * as InMemory from '../in-memory/index.ts';

type BankTableService = StdTableService<'bank'>;

const checkpointed = <T extends object>(
  schema: typeof AccountEntity | typeof TransferEntity,
  cursor: T | null,
  watch: (cursor: T | null) => Stream.Stream<T, never, BankTableService>,
): Stream.Stream<T, never, BankTableService> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const checkpoint = yield* StreamCheckpoint;
      const resumed = yield* checkpoint.get(schema).pipe(Effect.orDie);
      const resumeFrom = Option.getOrElse(resumed, () => cursor) as T | null;
      return watch(resumeFrom).pipe(
        Stream.tap((item) => checkpoint.put(item, schema).pipe(Effect.orDie)),
      ) as Stream.Stream<T, never, BankTableService>;
    }),
  );

export const watchAccounts = (
  cursor: AccountRow | null,
): Stream.Stream<AccountRow, never, BankTableService> =>
  checkpointed(AccountEntity, cursor, InMemory.watchAccounts);

export const watchTransfers = (
  account: string,
  direction: TransferDirection,
  cursor: TransferRow | null,
): Stream.Stream<TransferRow, never, BankTableService> =>
  checkpointed(TransferEntity, cursor, (resumeFrom) =>
    InMemory.watchTransfers(account, direction, resumeFrom),
  );

export const watchAllTransfers = (
  cursor: TransferRow | null,
): Stream.Stream<TransferRow, never, BankTableService> =>
  checkpointed(TransferEntity, cursor, InMemory.watchAllTransfers);

export const BankSubscriptionsLive = BankSubscriptions.toLayer({
  subscribeAccounts: ({ '>': cursor }) => watchAccounts(cursor),
  subscribeTransfers: ({ account, direction, '>': cursor }) =>
    watchTransfers(account, direction, cursor),
  subscribeAllTransfers: ({ '>': cursor }) => watchAllTransfers(cursor),
});
