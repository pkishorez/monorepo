import { Duration, Effect, Option, Stream } from 'effect';
import type { DecodedEntity } from 'std-toolkit/core';
import type { QueryPage, StdTableService } from 'std-toolkit/db';
import {
  accountEntity,
  type AccountRow,
} from '../../std-table/entities/account/index.ts';
import {
  transferEntity,
  type TransferRow,
} from '../../std-table/entities/transfer/index.ts';
import {
  AccountEntity,
  BankSubscriptions,
  TransferEntity,
} from '../contract/index.ts';
import {
  CATCH_UP_PAGE_SIZE,
  PUSH_BATCH_SIZE,
  PUSH_BATCH_WINDOW_MS,
} from '../../contract/tuning/index.ts';
import { checkpointed } from './checkpoint.ts';

type BankTableService = StdTableService<'bank'>;
type Batch<T> = ReadonlyArray<DecodedEntity<T>>;

const stamp = <T>(row: DecodedEntity<T>): DecodedEntity<T> => ({
  ...row,
  meta: { ...row.meta, _s: Date.now() },
});

const catchUp = <T extends object>(
  fetchPage: (
    cursor: DecodedEntity<T> | null,
  ) => Effect.Effect<QueryPage<DecodedEntity<T>>, never, BankTableService>,
  cursor: DecodedEntity<T> | null,
): Stream.Stream<Batch<T>, never, BankTableService> =>
  Stream.paginate(cursor, (after: DecodedEntity<T> | null) =>
    Effect.map(fetchPage(after), (page) => {
      const last = page.items.at(-1);
      return [
        page.items.length === 0 ? [] : [page.items],
        page.hasMore && last !== undefined
          ? Option.some<DecodedEntity<T> | null>(last)
          : Option.none<DecodedEntity<T> | null>(),
      ] as const;
    }),
  );

const watch = <T extends object>(config: {
  readonly cursor: DecodedEntity<T> | null;
  readonly fetchPage: (
    cursor: DecodedEntity<T> | null,
  ) => Effect.Effect<QueryPage<DecodedEntity<T>>, never, BankTableService>;
  readonly subscribe: () => Stream.Stream<DecodedEntity<T>>;
}): Stream.Stream<Batch<T>, never, BankTableService> =>
  Stream.concat(
    catchUp(config.fetchPage, config.cursor),
    Stream.suspend(() => config.subscribe()).pipe(
      Stream.groupedWithin(
        PUSH_BATCH_SIZE,
        Duration.millis(PUSH_BATCH_WINDOW_MS),
      ),
    ),
  ).pipe(Stream.map((batch): Batch<T> => batch.map((row) => stamp(row))));

export const watchAccounts = (
  cursor: AccountRow | null,
): Stream.Stream<ReadonlyArray<AccountRow>, never, BankTableService> =>
  watch({
    cursor,
    fetchPage: (after) =>
      accountEntity
        .query(
          'byUpdated',
          { pk: {}, '>=': null },
          { limit: CATCH_UP_PAGE_SIZE, ...(after === null ? {} : { after }) },
        )
        .pipe(Effect.orDie),
    subscribe: () => accountEntity.subscribe(),
  });

export type TransferSide = 'from' | 'to';

const pageOf = (after: TransferRow | null) => ({
  limit: CATCH_UP_PAGE_SIZE,
  ...(after === null ? {} : { after }),
});

const transferPages = {
  from: (account: string, after: TransferRow | null) =>
    transferEntity.query(
      'byFrom',
      { pk: { from: account }, '>=': null },
      pageOf(after),
    ),
  to: (account: string, after: TransferRow | null) =>
    transferEntity.query(
      'byTo',
      { pk: { to: account }, '>=': null },
      pageOf(after),
    ),
};

export const watchTransfers = (
  side: TransferSide,
  account: string,
  cursor: TransferRow | null,
): Stream.Stream<ReadonlyArray<TransferRow>, never, BankTableService> =>
  watch({
    cursor,
    fetchPage: (after) =>
      transferPages[side](account, after).pipe(Effect.orDie),
    subscribe: () => transferEntity.subscribe({ [side]: account }),
  });

export interface BankSubscriptionsOptions {
  /** Resume from the hibernation checkpoint instead of the client cursor — only meaningful inside a Durable Object. */
  readonly checkpoint: boolean;
}

export const BankSubscriptionsLive = ({
  checkpoint,
}: BankSubscriptionsOptions) =>
  BankSubscriptions.toLayer({
    subscribeAccounts: ({ '>': cursor }) =>
      checkpoint
        ? checkpointed(AccountEntity, cursor, watchAccounts)
        : watchAccounts(cursor),
    subscribeTransfersFrom: ({ from, '>': cursor }) =>
      checkpoint
        ? checkpointed(TransferEntity, cursor, (resume) =>
            watchTransfers('from', from, resume),
          )
        : watchTransfers('from', from, cursor),
    subscribeTransfersTo: ({ to, '>': cursor }) =>
      checkpoint
        ? checkpointed(TransferEntity, cursor, (resume) =>
            watchTransfers('to', to, resume),
          )
        : watchTransfers('to', to, cursor),
  });
