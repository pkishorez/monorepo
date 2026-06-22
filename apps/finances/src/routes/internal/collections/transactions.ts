import { Effect } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { createStdSync, syncStrategy } from '@std-toolkit/tanstack-sync';
import { ProjectionOutputSchema, TransactionSchema } from '@/domain/index';
import { FinancesClient, financesRuntime } from '@/routes/internal/effect';
import { streamSource } from './utils.js';

type ProjectionOutput = typeof ProjectionOutputSchema.Type;
type Transaction = typeof TransactionSchema.Type;

const std = createStdSync();

export const transactionsCollection = std.collection({
  schema: TransactionSchema,
  strategy: syncStrategy.oldToNew({
    stream: streamSource((cursor) =>
      Effect.gen(function* () {
        const { client } = yield* FinancesClient;
        return client.subscribeTransactions({ cursor });
      }),
    ),
  }),
});

export const transactionsUtils = transactionsCollection.utils;

export function replaceTransactions(projection: ProjectionOutput) {
  return financesRuntime
    .runPromise(
      Effect.gen(function* () {
        const { client } = yield* FinancesClient;
        return yield* client.replaceTransactions(projection);
      }),
    )
    .then((items) => {
      if (items.length > 0) {
        void Effect.runPromise(
          transactionsUtils.writeUpsert(items as EntityType<Transaction>[]),
        );
      }
      return items;
    });
}
