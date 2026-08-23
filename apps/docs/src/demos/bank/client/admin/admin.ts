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
  readonly syncName: string;
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

const deleteDatabase = (name: string): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess =
      request.onerror =
      request.onblocked =
        () => resume(Effect.void);
  });

const dropSyncDatabases = (prefix: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (typeof indexedDB === 'undefined') return;
    const databases = yield* Effect.promise(() => indexedDB.databases());
    const names = databases.flatMap(({ name }) =>
      name?.startsWith(prefix) ? [name] : [],
    );
    yield* Effect.forEach(names, deleteDatabase, { discard: true });
  });

export const makeAdmin = ({
  api,
  sync: { std, accounts },
  syncName,
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
        .pipe(
          Effect.andThen(Effect.promise(() => std.dispose())),
          Effect.andThen(dropSyncDatabases(`std-sync:${syncName}-`)),
          Effect.withSpan('Clear the bank'),
        ),
    ),
});
