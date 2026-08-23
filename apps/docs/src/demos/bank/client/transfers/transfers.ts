import { createOptimisticAction } from '@tanstack/react-db';
import { Effect, Semaphore } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { BankApi } from '../api/index.ts';
import type { BankRunner, Network, Vitals } from '../diagnostics/index.ts';
import { makeLiveValue, type LiveValue } from '../live-value.ts';
import type { BankSync } from '../sync/index.ts';
import { explain } from './problem.ts';

export interface TransferRequest {
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export type AttemptPhase = 'sending' | 'refused' | 'failed';

export interface Attempt extends TransferRequest {
  readonly id: string;
  readonly phase: AttemptPhase;
  readonly message: string | null;
  readonly attempt: number;
}

export interface Transfers {
  readonly send: (request: TransferRequest) => void;
  readonly retry: (id: string) => void;
  readonly dismiss: (id: string) => void;
  readonly attempts: LiveValue<readonly Attempt[]>;
}

export interface TransfersOptions {
  readonly api: BankApi;
  readonly sync: BankSync;
  readonly network: Network;
  readonly vitals: Vitals;
  readonly runner: BankRunner;
}

const REFUSAL_LINGER = '5 seconds';

export const makeTransfers = ({
  api,
  sync: { accounts, transfers },
  network,
  vitals,
  runner,
}: TransfersOptions): Transfers => {
  const attempts = makeLiveValue<readonly Attempt[]>([]);
  const put = (next: Attempt) =>
    attempts.update((all) => [
      ...all.filter((attempt) => attempt.id !== next.id),
      next,
    ]);
  const drop = (id: string) =>
    attempts.update((all) => all.filter((attempt) => attempt.id !== id));

  const lane = Semaphore.makeUnsafe(1);

  const commit = createOptimisticAction<Attempt>({
    onMutate: ({ id, from, to, amount }) => {
      accounts.update(from, (draft) => {
        draft.balance -= amount;
      });
      accounts.update(to, (draft) => {
        draft.balance += amount;
      });
      transfers.insert({ id, from, to, amount });
    },
    mutationFn: (input) =>
      runner.runPromise(
        vitals
          .patch((v) => ({ queued: v.queued + 1 }))
          .pipe(
            Effect.andThen(
              lane.withPermits(1)(
                vitals
                  .patch((v) => ({
                    queued: v.queued - 1,
                    committing: v.committing + 1,
                  }))
                  .pipe(
                    Effect.andThen(
                      network.travel.pipe(
                        Effect.withSpan('Travel the network'),
                      ),
                    ),
                    Effect.flatMap(() =>
                      api
                        .transfer({
                          id: input.id,
                          from: input.from,
                          to: input.to,
                          amount: input.amount,
                        })
                        .pipe(Effect.withSpan('Commit on the bank')),
                    ),
                    Effect.tap((outcome) =>
                      Effect.all([
                        accounts.utils.applyToSyncReplica([
                          ...outcome.accounts,
                        ]),
                        transfers.utils.applyToSyncReplica([outcome.transfer]),
                      ]).pipe(Effect.withSpan('Apply to the Sync Replica')),
                    ),
                    Effect.ensuring(
                      vitals.patch((v) => ({ committing: v.committing - 1 })),
                    ),
                  ),
              ),
            ),
            Effect.withSpan('Transfer', {
              attributes: {
                'transfer.id': input.id,
                'transfer.from': input.from,
                'transfer.to': input.to,
                'transfer.amount': input.amount,
              },
            }),
          ),
      ),
  });

  const linger = (id: string) =>
    Effect.runFork(
      Effect.sleep(REFUSAL_LINGER).pipe(
        Effect.andThen(Effect.sync(() => drop(id))),
      ),
    );

  const launch = (attempt: Attempt) => {
    put(attempt);
    commit(attempt).isPersisted.promise.then(
      () => drop(attempt.id),
      (error: unknown) => {
        const problem = explain(error);
        put({
          ...attempt,
          phase: problem.kind === 'refusal' ? 'refused' : 'failed',
          message: problem.message,
        });
        if (problem.kind === 'refusal') linger(attempt.id);
      },
    );
  };

  return {
    attempts,
    send: (request) =>
      launch({
        ...request,
        id: Effect.runSync(nextUlid),
        phase: 'sending',
        message: null,
        attempt: 0,
      }),
    retry: (id) => {
      const attempt = attempts.get().find((candidate) => candidate.id === id);
      if (attempt === undefined || attempt.phase === 'sending') return;
      launch({
        ...attempt,
        phase: 'sending',
        message: null,
        attempt: attempt.attempt + 1,
      });
    },
    dismiss: drop,
  };
};
