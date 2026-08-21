import { Effect, Schedule, Stream } from 'effect';
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
}): Stream.Stream<DecodedEntity<T>, never, BankTableService> => {
  let cursor = config.cursor;
  const tick = Effect.suspend(() => catchUp(config.fetchPage, cursor)).pipe(
    Effect.tap((items) =>
      Effect.sync(() => {
        const last = items.at(-1);
        if (last !== undefined) cursor = last;
      }),
    ),
  );
  return Stream.fromEffectSchedule(tick, Schedule.spaced('1 second')).pipe(
    Stream.flatMap(Stream.fromIterable),
    Stream.map(stamp),
  );
};

export const watchAccounts = (
  cursor: AccountRow | null,
): Stream.Stream<AccountRow, never, BankTableService> =>
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
  });

export const watchTransfers = (
  account: string,
  direction: TransferDirection,
  cursor: TransferRow | null,
): Stream.Stream<TransferRow, never, BankTableService> =>
  watch({
    cursor,
    fetchPage: (after) => {
      const options = { limit: 50, ...(after === null ? {} : { after }) };
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
  });

export const watchAllTransfers = (
  cursor: TransferRow | null,
): Stream.Stream<TransferRow, never, BankTableService> =>
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
  });

export const BankSubscriptionsLive = BankSubscriptions.toLayer({
  subscribeAccounts: ({ '>': cursor }) => watchAccounts(cursor),
  subscribeTransfers: ({ account, direction, '>': cursor }) =>
    watchTransfers(account, direction, cursor),
  subscribeAllTransfers: ({ '>': cursor }) => watchAllTransfers(cursor),
});
