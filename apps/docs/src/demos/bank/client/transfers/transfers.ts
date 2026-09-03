import {
  Activation,
  type ActivationRef,
  type MessageToken,
} from '@pkishorez/effect-tracer/flow';
import { Effect, Schema } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { BankApi } from '../api/index.ts';
import type { BankRunner, Network, Vitals } from '../diagnostics/index.ts';
import {
  makeInteractionFlow,
  type InteractionFlow,
} from '../interaction-flow/index.ts';
import { makeLiveValue, type LiveValue } from '../live-value.ts';
import type { BankSync } from '../sync/index.ts';
import { explain, type Problem } from './problem.ts';

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

// What the Outbox keeps for us across a reload: enough to redo the optimistic
// edit and fly the transfer once the bank is reachable.
const TransferPayload = Schema.Struct({
  id: Schema.String,
  from: Schema.String,
  to: Schema.String,
  amount: Schema.Number,
  attempt: Schema.Number,
});
type TransferPayload = typeof TransferPayload.Type;

interface Story {
  readonly flow: InteractionFlow;
  readonly ask: MessageToken;
  readonly user: ActivationRef;
  readonly bank: ActivationRef;
}

const REFUSAL_LINGER = '5 seconds';

// Offline is not a failure: the Outbox keeps the Entry and flies it later.
const isUnreachable = (error: unknown) =>
  (error as { _tag?: string } | null)?._tag === 'OutboxUnreachable';

export const makeTransfers = ({
  api,
  sync: { std, accounts, transfers },
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

  const flows = new Map<string, InteractionFlow>();
  const flowOf = (id: string) => {
    const existing = flows.get(id);
    if (existing) return existing;
    const created = makeInteractionFlow(std.flow, 'transfer', id);
    flows.set(id, created);
    return created;
  };
  const stories = new Map<string, Story>();
  // Transfer id → Outbox Entry id, so a failed Entry can be discarded later.
  const entries = new Map<string, string>();

  const nameOf = (id: string) => accounts.get(id)?.name ?? id;
  const headline = ({ from, to, amount }: TransferRequest) =>
    `${amount} · ${nameOf(from)} → ${nameOf(to)}`;
  const describe = (attempt: Attempt) =>
    `${attempt.attempt > 0 ? `Retry ${attempt.attempt} · ` : ''}Transfer ${headline(attempt)}`;
  const attributesOf = ({
    id,
    from,
    to,
    amount,
    attempt,
  }: TransferPayload) => ({
    'transfer.id': id,
    'transfer.from': nameOf(from),
    'transfer.to': nameOf(to),
    'transfer.amount': amount,
    'transfer.attempt': attempt,
  });

  const begin = (attempt: Attempt): Story =>
    runner.runSync(
      Effect.gen(function* () {
        const flow = flowOf(attempt.id);
        const label = describe(attempt);
        const attributes = attributesOf(attempt);
        const user = yield* flow.user.activation.start(label, { attributes });
        const ask = yield* flow.user.send('bank', label, { attributes });
        const bank = yield* flow.bank.activation.start(
          `Process transfer ${headline(attempt)}`,
          { attributes },
        );
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

  // A failed Entry stays in the Outbox until the user is done with it.
  const forget = (id: string) => {
    const entry = entries.get(id);
    entries.delete(id);
    if (entry !== undefined)
      void std.outbox.discard(entry).catch(() => undefined);
  };

  const failed = (payload: TransferPayload, error: unknown) => {
    const problem: Problem = explain(error);
    settle(
      payload.id,
      Activation.failed(problem.message),
      `${problem.kind === 'refusal' ? 'Refused' : 'Failed'}: ${problem.message}`,
    );
    put({
      ...payload,
      phase: problem.kind === 'refusal' ? 'refused' : 'failed',
      message: problem.message,
    });
    if (problem.kind === 'refusal') linger(payload.id);
  };

  const transfer = std.createOfflineAction({
    name: 'transfer',
    payload: TransferPayload,
    // Runs on send and again on replay after a reload, so the ledger and the
    // attempts panel both come back showing what is still in the Outbox.
    onMutate: (payload) => {
      const { id, from, to, amount } = payload;
      const attempt: Attempt = { ...payload, phase: 'sending', message: null };
      stories.set(id, begin(attempt));
      put(attempt);
      runner.runSync(
        Effect.sync(() => {
          accounts.update(from, (draft) => {
            draft.balance -= amount;
          });
          accounts.update(to, (draft) => {
            draft.balance += amount;
          });
          transfers.insert({ id, from, to, amount });
        }).pipe(
          flowOf(id).bank.withSpan('Apply optimistically'),
          Effect.andThen(vitals.patch((v) => ({ queued: v.queued + 1 }))),
        ),
      );
    },
    mutationFn: (input, { entryId }) =>
      Effect.gen(function* () {
        entries.set(input.id, entryId);
        const flow = flowOf(input.id);
        const { bank, api: apiLane } = flow;
        yield* vitals.patch((v) => ({
          queued: v.queued - 1,
          committing: v.committing + 1,
        }));
        yield* bank.log('Flown by the Outbox Drainer');
        const outcome = yield* flow
          .call(
            `Commit transfer ${headline(input)}`,
            network.reach.pipe(
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
              attributes: attributesOf(input),
            },
          )
          .pipe(
            Effect.tapError((error) =>
              isUnreachable(error)
                ? vitals.patch((v) => ({ queued: v.queued + 1 }))
                : Effect.sync(() => failed(input, error)),
            ),
            Effect.ensuring(
              vitals.patch((v) => ({ committing: v.committing - 1 })),
            ),
          );
        yield* Effect.all([
          accounts.utils.applyToSyncReplica([...outcome.accounts]),
          transfers.utils.applyToSyncReplica([outcome.transfer]),
        ]).pipe(bank.withSpan('Apply the outcome to the Sync Replica'));
        settle(input.id, Activation.completed(), 'Settled');
        drop(input.id);
        entries.delete(input.id);
        return outcome;
      }).pipe(Effect.withSpan('Transfer', { attributes: attributesOf(input) })),
  });

  const linger = (id: string) =>
    Effect.runFork(
      Effect.sleep(REFUSAL_LINGER).pipe(
        Effect.andThen(
          Effect.sync(() => {
            drop(id);
            forget(id);
          }),
        ),
      ),
    );

  const launch = (payload: TransferPayload) => void transfer(payload);

  return {
    attempts,
    send: (request) =>
      launch({ ...request, id: Effect.runSync(nextUlid), attempt: 0 }),
    retry: (id) => {
      const attempt = attempts.get().find((candidate) => candidate.id === id);
      if (attempt === undefined || attempt.phase === 'sending') return;
      forget(id);
      launch({
        id,
        from: attempt.from,
        to: attempt.to,
        amount: attempt.amount,
        attempt: attempt.attempt + 1,
      });
    },
    dismiss: (id) => {
      const flow = flows.get(id);
      if (flow) runner.runSync(flow.user.log('Dismissed'));
      drop(id);
      forget(id);
    },
  };
};
