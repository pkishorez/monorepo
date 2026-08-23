import { Array as Arr, Effect } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { BankApi } from '../api/index.ts';
import type { BankRunner } from '../diagnostics/index.ts';
import { makeInteractionFlow } from '../interaction-flow/index.ts';
import type { BankSync } from '../sync/index.ts';

export interface Opening {
  readonly name: string;
  readonly balance: number;
}

export interface Admin {
  readonly open: (opening: Opening) => string;
  readonly seed: (count: number) => Promise<void>;
  readonly clear: () => Promise<void>;
}

export interface AdminOptions {
  readonly api: BankApi;
  readonly sync: BankSync;
  readonly runner: BankRunner;
}

const SEED_BURST = 500;

const seedNames = (count: number): readonly string[] => {
  const taken = new Set<number>();
  while (taken.size < count)
    taken.add(1000 + Math.floor(Math.random() * 999_000));
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
    const flow = makeInteractionFlow('open', id);
    const label = `Open ${opening.name} with ${opening.balance}`;
    runner.runSync(
      flow.user.activated({ name: label })(
        flow.user.send('bank', label).pipe(
          Effect.andThen(
            Effect.sync(() =>
              accounts.insert({
                id,
                name: opening.name,
                balance: opening.balance,
              }),
            ).pipe(flow.bank.withSpan('Insert into the accounts collection')),
          ),
          Effect.andThen(
            flow.bank.log('The accounts collection persists it — see its flow'),
          ),
        ),
      ),
    );
    return id;
  },
  seed: (count) => {
    const flow = makeInteractionFlow('seed', newId());
    const label = `Seed ${count} accounts`;
    return runner.runPromise(
      flow.user.activated({ name: label })(
        flow.user.send('bank', label).pipe(
          Effect.andThen(
            Effect.forEach(
              Arr.chunksOf(seedNames(count), SEED_BURST),
              (names) =>
                Effect.promise(
                  () =>
                    accounts.insert(
                      names.map((name) => ({
                        id: newId(),
                        name,
                        balance: seedBalance(),
                      })),
                    ).isPersisted.promise,
                ).pipe(
                  flow.bank.withSpan('Seed a burst', {
                    attributes: { 'seed.burst': names.length },
                  }),
                ),
              { discard: true },
            ).pipe(
              flow.bank.withSpan('Seed accounts', {
                attributes: { 'seed.count': count },
              }),
            ),
          ),
        ),
      ),
    );
  },
  clear: () => {
    const flow = makeInteractionFlow('clear', newId());
    return runner.runPromise(
      flow.user.activated({ name: 'Clear the bank' })(
        flow.user.send('bank', 'Clear the bank').pipe(
          Effect.andThen(
            flow.call('clear', api.clear(), {
              reply: () => 'Cleared',
              failure: (error) => String(error),
            }),
          ),
          Effect.andThen(
            forget.pipe(flow.bank.withSpan('Drop the local replica')),
          ),
        ),
      ),
    );
  },
});
