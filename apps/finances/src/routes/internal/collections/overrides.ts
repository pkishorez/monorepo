import { Effect } from 'effect';
import { createStdSync, syncStrategy } from '@std-toolkit/tanstack-sync';
import { OverrideSchema } from '@/domain/index';
import { FinancesClient } from '@/routes/internal/effect';
import { run, streamSource } from './utils.js';

const std = createStdSync();

export const overridesCollection = std.collection({
  schema: OverrideSchema,
  strategy: syncStrategy.oldToNew({
    stream: streamSource((cursor) =>
      Effect.gen(function* () {
        const { client } = yield* FinancesClient;
        return client.subscribeOverrides({ cursor });
      }),
    ),
  }),
  onInsert: (item) =>
    run(
      Effect.gen(function* () {
        const { client } = yield* FinancesClient;
        return yield* client.saveOverride({
          transactionId: item.transactionId,
          category: item.category,
          subcategory: item.subcategory,
          notes: item.notes,
          verified: item.verified,
          ignore: item.ignore,
          cancelled_by: item.cancelled_by,
        });
      }),
    ),
  onUpdate: (payload) =>
    run(
      Effect.gen(function* () {
        const { client } = yield* FinancesClient;
        return yield* client.saveOverride({
          transactionId: payload.transactionId,
          category: '',
          subcategory: '',
          verified: false,
          ignore: false,
          cancelled_by: null,
          ...payload.updates,
        });
      }),
    ),
});

export const overridesUtils = overridesCollection.utils;
