import { Effect } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import { listAccounts, openAccount } from '../accounts/index.ts';

export const SEED_SIZE = 8;

export const seedNames = (count: number): readonly string[] => {
  const taken = new Set<number>();
  while (taken.size < count) taken.add(1000 + Math.floor(Math.random() * 9000));
  return [...taken].map((suffix) => `User ${suffix}`);
};

export const seedBalance = (): number =>
  50 * (2 + Math.floor(Math.random() * 19));

export const seedBankIfEmpty: Effect.Effect<
  boolean,
  never,
  StdTableService<'bank'>
> = Effect.gen(function* () {
  const existing = yield* listAccounts(null);
  if (existing.length > 0) return false;
  yield* Effect.all(
    seedNames(SEED_SIZE).map((name) =>
      Effect.gen(function* () {
        const id = yield* nextUlid;
        yield* openAccount({ id, name, balance: seedBalance() }).pipe(
          Effect.orDie,
        );
      }),
    ),
    { discard: true },
  );
  return true;
});
