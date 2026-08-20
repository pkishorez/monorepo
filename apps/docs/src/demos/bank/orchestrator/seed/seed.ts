import { Effect } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import { accountEntity } from '../../std-table/entities/account/index.ts';
import { listAccounts, openAccount } from '../accounts/index.ts';
import { transfer } from '../transfers/index.ts';

const SEED_SIZE = 8;

const SEED_TRANSFERS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 4, 25],
  [1, 2, 40],
  [2, 3, 15],
];

const seedNames = (count: number): readonly string[] => {
  const taken = new Set<number>();
  while (taken.size < count) taken.add(1000 + Math.floor(Math.random() * 9000));
  return [...taken].map((suffix) => `User ${suffix}`);
};

const seedBalance = (): number => 50 * (2 + Math.floor(Math.random() * 19));

export const seedBankIfEmpty: Effect.Effect<
  boolean,
  never,
  StdTableService<'bank'>
> = Effect.gen(function* () {
  const existing = yield* listAccounts(null);
  if (existing.length > 0) return false;
  const opened = yield* Effect.all(
    seedNames(SEED_SIZE).map((name) =>
      Effect.gen(function* () {
        const id = yield* nextUlid;
        yield* openAccount({ id, name }).pipe(Effect.orDie);
        return id;
      }),
    ),
  );
  yield* Effect.all(
    opened.map((id) =>
      accountEntity
        .getAndUpdate({ id }, { balance: seedBalance() })
        .pipe(Effect.orDie),
    ),
    { discard: true },
  );
  yield* Effect.all(
    SEED_TRANSFERS.map(([from, to, amount]) =>
      transfer({ from: opened[from]!, to: opened[to]!, amount }).pipe(
        Effect.orDie,
      ),
    ),
    { discard: true },
  );
  return true;
});
