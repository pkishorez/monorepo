import type { PendingMutation, Transaction } from '@tanstack/react-db';
import { Effect } from 'effect';
import {
  narrateOutbox,
  replayEntryId,
  type OutboxRuntime,
  type PendingEntry,
} from '../../outbox/outbox/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';

// Shared by keyed and single-item mutations: plan an Entry per Mutation (a
// replayed Mutation reuses its Entry's id instead of getting a new one),
// enqueue the batch, then wait for every Mutation's Entry to settle.
export const runOutboxTransaction = <TCollItem extends object, R>(args: {
  runner: EffectRunner<R>;
  outbox: OutboxRuntime;
  story: ReturnType<typeof narrateOutbox>;
  withMutationSpan: (
    mutation: Effect.Effect<void, unknown, R>,
  ) => Effect.Effect<void, unknown, R>;
  transaction: Transaction<TCollItem>;
  buildEntry: (
    mutation: PendingMutation<TCollItem>,
    id: string,
  ) => Effect.Effect<PendingEntry, unknown>;
}): Promise<void> => {
  const { runner, outbox, story, transaction } = args;
  return runner.runPromise(
    args.withMutationSpan(
      Effect.gen(function* () {
        const plans = yield* Effect.forEach(
          transaction.mutations,
          (mutation: PendingMutation<TCollItem>) =>
            Effect.gen(function* () {
              const replayId = replayEntryId(mutation.metadata);
              if (replayId !== null) return { id: replayId, entry: null };
              const id = mutation.mutationId;
              return { id, entry: yield* args.buildEntry(mutation, id) };
            }),
        );
        const ids = plans.map((plan) => plan.id);
        const batch = plans.flatMap((plan) => (plan.entry ? [plan.entry] : []));
        yield* story.queue(
          {
            entryIds: ids,
            replayed: plans.some((plan) => plan.entry === null),
          },
          batch.length === 0
            ? Effect.void
            : story.enqueue(batch, outbox.enqueue(batch)),
          // Concurrent so every Entry's transaction is known at once.
          Effect.forEach(
            ids,
            (id) => outbox.delivered(id, transaction as Transaction),
            { concurrency: 'unbounded', discard: true },
          ),
        );
      }),
    ),
  );
};
