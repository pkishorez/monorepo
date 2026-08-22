import { Duration, Effect, Stream } from 'effect';
import type { DecodedEntity } from 'std-toolkit/core';
import type { QueryPage, StdTableService } from 'std-toolkit/db';
import {
  BankSubscriptions,
  type TransferDirection,
} from '../../contract/index.ts';
import {
  accountEntity,
  type AccountRow,
} from '../../../std-table/entities/account/index.ts';
import {
  transferEntity,
  type TransferRow,
} from '../../../std-table/entities/transfer/index.ts';

type BankTableService = StdTableService<'bank'>;
type Batch<T> = ReadonlyArray<DecodedEntity<T>>;

const batchSize = 20;
const batchWindow = Duration.millis(50);

const stamp = <T>(row: DecodedEntity<T>): DecodedEntity<T> => ({
  ...row,
  meta: { ...row.meta, _s: Date.now() },
});

const catchUp = <T extends object>(
  fetchPage: (
    cursor: DecodedEntity<T> | null,
  ) => Effect.Effect<QueryPage<DecodedEntity<T>>, never, BankTableService>,
  cursor: DecodedEntity<T> | null,
): Effect.Effect<readonly DecodedEntity<T>[], never, BankTableService> =>
  Effect.gen(function* () {
    const items: DecodedEntity<T>[] = [];
    let after = cursor;
    while (true) {
      const page = yield* fetchPage(after);
      items.push(...page.items);
      const last = page.items.at(-1);
      if (!page.hasMore || last === undefined) break;
      after = last;
    }
    return items;
  });

const watch = <T extends object>(config: {
  readonly cursor: DecodedEntity<T> | null;
  readonly fetchPage: (
    cursor: DecodedEntity<T> | null,
  ) => Effect.Effect<QueryPage<DecodedEntity<T>>, never, BankTableService>;
  readonly subscribe: () => Stream.Stream<DecodedEntity<T>>;
}): Stream.Stream<Batch<T>, never, BankTableService> =>
  Stream.concat(
    Stream.fromIterableEffect(catchUp(config.fetchPage, config.cursor)),
    Stream.suspend(() => config.subscribe()),
  ).pipe(Stream.map(stamp), Stream.groupedWithin(batchSize, batchWindow));

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
          { limit: 100, ...(after === null ? {} : { after }) },
        )
        .pipe(Effect.orDie),
    subscribe: () => accountEntity.subscribe(),
  });

export const watchTransfers = (
  account: string,
  direction: TransferDirection,
  cursor: TransferRow | null,
): Stream.Stream<ReadonlyArray<TransferRow>, never, BankTableService> =>
  watch({
    cursor,
    fetchPage: (after) => {
      const options = {
        limit: 50,
        ...(after === null ? {} : { after }),
      };
      return (
        direction === 'sent'
          ? transferEntity.query(
              'bySender',
              { pk: { from: account }, '<': null },
              options,
            )
          : transferEntity.query(
              'byReceiver',
              { pk: { to: account }, '<': null },
              options,
            )
      ).pipe(Effect.orDie);
    },
    subscribe: () =>
      direction === 'sent'
        ? transferEntity.subscribe({ from: account })
        : transferEntity.subscribe({ to: account }),
  });

export const watchAllTransfers = (
  cursor: TransferRow | null,
): Stream.Stream<ReadonlyArray<TransferRow>, never, BankTableService> =>
  watch({
    cursor,
    fetchPage: (after) =>
      transferEntity
        .query(
          'primary',
          { pk: {}, '>=': null },
          { limit: 100, ...(after === null ? {} : { after }) },
        )
        .pipe(Effect.orDie),
    subscribe: () => transferEntity.subscribe(),
  });

export const BankSubscriptionsLive = BankSubscriptions.toLayer({
  subscribeAccounts: ({ '>': cursor }) => watchAccounts(cursor),
  subscribeTransfers: ({ account, direction, '>': cursor }) =>
    watchTransfers(account, direction, cursor),
  subscribeAllTransfers: ({ '>': cursor }) => watchAllTransfers(cursor),
});
