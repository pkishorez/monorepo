import { Effect } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import { TransferRefused } from '../../contract/refusal/index.ts';
import { isValidAmount } from '../../contract/transfer/index.ts';
import type { AccountRow } from '../../std-table/entities/account/index.ts';
import {
  transferEntity,
  type TransferRow,
} from '../../std-table/entities/transfer/index.ts';
import { stamp } from '../stamp/index.ts';
import { settle } from './settlement.ts';

type BankTableService = StdTableService<'bank'>;

export type TransferDirection = 'sent' | 'received';

export interface TransferInput {
  readonly id?: string | undefined;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export interface TransferOutcome {
  readonly transfer: TransferRow;
  readonly accounts: readonly AccountRow[];
}

export const transfer = (
  input: TransferInput,
): Effect.Effect<TransferOutcome, TransferRefused, BankTableService> =>
  Effect.gen(function* () {
    if (!isValidAmount(input.amount))
      return yield* Effect.fail(
        new TransferRefused({ reason: 'invalid-amount' }),
      );
    if (input.from === input.to)
      return yield* Effect.fail(
        new TransferRefused({ reason: 'same-account' }),
      );
    const id = input.id ?? (yield* nextUlid);
    return yield* settle(id, input.from, input.to, input.amount);
  });

export const listTransfers = (
  account: string,
  direction: TransferDirection,
  cursor: TransferRow | null,
): Effect.Effect<TransferRow[], never, BankTableService> => {
  const options = { limit: 50, ...(cursor === null ? {} : { after: cursor }) };
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
  ).pipe(
    Effect.map(({ items }) => items.map(stamp)),
    Effect.orDie,
  );
};

export const listAllTransfers = (
  cursor: TransferRow | null,
): Effect.Effect<TransferRow[], never, BankTableService> =>
  transferEntity
    .query(
      'primary',
      { pk: {}, '>=': null },
      { limit: 100, ...(cursor === null ? {} : { after: cursor }) },
    )
    .pipe(
      Effect.map(({ items }) => items.map(stamp)),
      Effect.orDie,
    );
