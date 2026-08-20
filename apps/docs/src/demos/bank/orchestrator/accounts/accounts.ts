import { Effect } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import { InvalidName, normalizeName } from '../../contract/name/index.ts';
import {
  accountEntity,
  type AccountRow,
} from '../../std-table/entities/account/index.ts';
import { stamp } from '../stamp/index.ts';

type BankTableService = StdTableService<'bank'>;

export interface OpenAccountInput {
  readonly id?: string | undefined;
  readonly name: string;
}

export const listAccounts = (
  cursor: AccountRow | null,
): Effect.Effect<AccountRow[], never, BankTableService> =>
  accountEntity
    .query(
      'byUpdated',
      { pk: {}, '>=': null },
      { limit: 100, ...(cursor === null ? {} : { after: cursor }) },
    )
    .pipe(
      Effect.map(({ items }) => items.map(stamp)),
      Effect.orDie,
    );

export const openAccount = (
  input: OpenAccountInput,
): Effect.Effect<AccountRow, InvalidName, BankTableService> =>
  Effect.gen(function* () {
    const name = normalizeName(input.name);
    if (name === null) return yield* Effect.fail(new InvalidName());
    const id = input.id ?? (yield* nextUlid);
    return yield* accountEntity
      .insert({ id, name, balance: 0 })
      .pipe(Effect.map(stamp), Effect.orDie);
  });
