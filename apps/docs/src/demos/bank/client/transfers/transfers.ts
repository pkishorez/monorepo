import { createOptimisticAction } from '@tanstack/react-db';
import {
  Activation,
  type ActivationRef,
  type MessageToken,
} from '@pkishorez/effect-tracer/flow';
import { Clock, Effect, Semaphore } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { BankApi } from '../api/index.ts';
import type { BankRunner, Network, Vitals } from '../diagnostics/index.ts';
import {
  makeInteractionFlow,
  type InteractionFlow,
} from '../interaction-flow/index.ts';
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

interface Story {
  readonly flow: InteractionFlow;
  readonly ask: MessageToken;
  readonly user: ActivationRef;
  readonly bank: ActivationRef;
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

  const flows = new Map<string, InteractionFlow>();
  const flowOf = (id: string) => {
    const existing = flows.get(id);
    if (existing) return existing;
    const created = makeInteractionFlow('transfer', id);
    flows.set(id, created);
    return created;
  };
  const stories = new Map<string, Story>();

  const nameOf = (id: string) => accounts.get(id)?.name ?? id;
  const describe = ({ from, to, amount, attempt }: Attempt) =>
    `${attempt > 0 ? `Retry ${attempt} · ` : ''}Transfer ${amount} · ${nameOf(from)} → ${nameOf(to)}`;

  const commit = createOptimisticAction<Attempt>({
    onMutate: (attempt) => {
      const { id, from, to, amount } = attempt;
      const apply = Effect.sync(() => {
        accounts.update(from, (draft) => {
          draft.balance -= amount;
        });
        accounts.update(to, (draft) => {
          draft.balance += amount;
        });
        transfers.insert({ id, from, to, amount });
      });
      runner.runSync(
        apply.pipe(flowOf(id).bank.withSpan('Apply optimistically')),
      );
    },
    mutationFn: (input) =>
      runner.runPromise(
        Effect.gen(function* () {
          const flow = flowOf(input.id);
          const { bank, api: apiLane } = flow;
          yield* vitals.patch((v) => ({ queued: v.queued + 1 }));
          yield* bank.log('Queued for the lane');
          const queuedAt = yield* Clock.currentTimeMillis;
          return yield* lane.withPermits(1)(
            Effect.gen(function* () {
              yield* vitals.patch((v) => ({
                queued: v.queued - 1,
                committing: v.committing + 1,
              }));
              const waitedMs = (yield* Clock.currentTimeMillis) - queuedAt;
              yield* bank.log('Lane acquired', { attributes: { waitedMs } });
              const outcome = yield* flow.call(
                `transfer ${input.amount}`,
                network.travel.pipe(
                  apiLane.withSpan('Travel the network'),
                  Effect.andThen(
                    api
                      .transfer({
                        id: input.id,
                        from: input.from,
                        to: input.to,
                        amount: input.amount,
                      })
                      .pipe(apiLane.withSpan('Commit on the bank')),
                  ),
                ),
                {
                  reply: ({ accounts: touched }) =>
                    `${touched.length} accounts + 1 transfer`,
                  failure: (error) => explain(error).message,
                },
              );
              yield* Effect.all([
                accounts.utils.applyToSyncReplica([...outcome.accounts]),
                transfers.utils.applyToSyncReplica([outcome.transfer]),
              ]).pipe(bank.withSpan('Apply the outcome to the Sync Replica'));
              return outcome;
            }).pipe(
              Effect.ensuring(
                vitals.patch((v) => ({ committing: v.committing - 1 })),
              ),
            ),
          );
        }).pipe(
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

  const begin = (attempt: Attempt): Story =>
    runner.runSync(
      Effect.gen(function* () {
        const flow = flowOf(attempt.id);
        const label = describe(attempt);
        const user = yield* flow.user.activation.start(label);
        const ask = yield* flow.user.send('bank', label, {
          attributes: {
            from: attempt.from,
            to: attempt.to,
            amount: attempt.amount,
          },
        });
        const bank = yield* flow.bank.activation.start('Handle the transfer');
        return { flow, ask, user, bank };
      }),
    );

  const settle = (
    id: string,
    outcome: Parameters<ActivationRef['end']>[0],
    message: string,
  ) => {
    const story = stories.get(id);
    if (!story) return;
    stories.delete(id);
    runner.runSync(
      Effect.all([
        story.bank.end(outcome),
        story.flow.bank.reply(story.ask, message, {
          level: outcome.kind === 'failed' ? 'error' : 'info',
        }),
        story.user.end(outcome),
      ]),
    );
  };

  const launch = (attempt: Attempt) => {
    stories.set(attempt.id, begin(attempt));
    put(attempt);
    commit(attempt).isPersisted.promise.then(
      () => {
        settle(attempt.id, Activation.completed(), 'Settled');
        drop(attempt.id);
      },
      (error: unknown) => {
        const problem = explain(error);
        settle(
          attempt.id,
          Activation.failed(problem.message),
          `${problem.kind === 'refusal' ? 'Refused' : 'Failed'}: ${problem.message}`,
        );
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
    dismiss: (id) => {
      const flow = flows.get(id);
      if (flow) runner.runSync(flow.user.log('Dismissed'));
      drop(id);
    },
  };
};
