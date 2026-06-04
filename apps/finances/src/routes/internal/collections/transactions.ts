import { createCollection } from '@tanstack/react-db';
import { Effect, Stream } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { createStdSync } from '@std-toolkit/tanstack-sync';
import { ProjectionOutputSchema, TransactionSchema } from '@/domain/index';
import { FinancesClient, financesRuntime } from '@/routes/internal/effect';

type ProjectionOutput = typeof ProjectionOutputSchema.Type;
type Transaction = typeof TransactionSchema.Type;

const std = createStdSync();

const transactionsSyncConfig = std.totalSync({
  schema: TransactionSchema,
  subscribe: ({ getCursor, push, onInitialSyncDone }) =>
    Effect.gen(function* () {
      const { client } = yield* FinancesClient;
      const cursor = yield* getCursor;
      const stream = client.subscribeTransactions({
        cursor: cursor?.meta._u ?? null,
      });

      yield* Stream.runForEach(stream, (event) =>
        Effect.sync(() => {
          if (event._tag === 'batch') {
            push(event.items as EntityType<Transaction>[]);
          } else if (event._tag === 'initial-sync-done') {
            onInitialSyncDone();
          }
        }),
      );
    }).pipe(Effect.provide(FinancesClient.layer), Effect.orDie),
});

export const transactionsCollection = createCollection(transactionsSyncConfig);
export const transactionsUtils = transactionsSyncConfig.utils;

export function replaceTransactions(projection: ProjectionOutput) {
  return financesRuntime
    .runPromise(
      Effect.gen(function* () {
        const { client } = yield* FinancesClient;
        return yield* client.replaceTransactions(projection);
      }),
    )
    .then((items) => {
      const keys = Array.from(transactionsCollection.state.keys());
      if (keys.length > 0) {
        transactionsUtils.remove(keys);
      }
      if (items.length > 0) {
        transactionsUtils.upsert(items as EntityType<Transaction>[]);
      }
      return items;
    });
}
