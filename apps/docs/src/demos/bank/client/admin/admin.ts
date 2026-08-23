import { Array as Arr, Effect } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { BankApi } from '../api/index.ts';
import type { BankRunner } from '../diagnostics/index.ts';
import type { BankSync } from '../sync/index.ts';

export interface Opening {
  readonly name: string;
  readonly balance: number;
}

export interface Admin {
  /** Opens an account optimistically and returns its Id. */
  readonly open: (opening: Opening) => string;
  readonly seed: (count: number) => Promise<void>;
  /** Wipes the bank and its local sync replica; the page must reload afterwards. */
  readonly clear: () => Promise<void>;
}

export interface AdminOptions {
  readonly api: BankApi;
  readonly sync: BankSync;
  readonly runner: BankRunner;
}

const SEED_BATCH = 1000;

const seedNames = (count: number): readonly string[] => {
  const taken = new Set<number>();
  while (taken.size < count)
    taken.add(1000 + Math.floor(Math.random() * 99_000));
  return [...taken].map((suffix) => `User ${suffix}`);
};

const seedBalance = (): number => 50 * (2 + Math.floor(Math.random() * 19));

const newId = (): string => Effect.runSync(nextUlid);

export const makeAdmin = ({
  api,
  sync: { accounts, forget },
  runner,
}: AdminOptions): Admin => ({
  open: (opening) => {
    const id = newId();
    accounts.insert({ id, name: opening.name, balance: opening.balance });
    return id;
  },
  seed: (count) =>
    runner.runPromise(
      Effect.forEach(
        Arr.chunksOf(seedNames(count), SEED_BATCH),
        (names) =>
          Effect.sync(() =>
            accounts.insert(
              names.map((name) => ({
                id: newId(),
                name,
                balance: seedBalance(),
              })),
            ),
          ).pipe(Effect.andThen(Effect.sleep(0))),
        { discard: true },
      ).pipe(
        Effect.withSpan('Seed accounts', {
          attributes: { 'seed.count': count },
        }),
      ),
    ),
  clear: () =>
    runner.runPromise(
      api
        .clear()
        .pipe(Effect.andThen(forget), Effect.withSpan('Clear the bank')),
    ),
});
