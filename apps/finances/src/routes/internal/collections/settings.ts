import { Effect } from 'effect';
import {
  createStdSync,
  singleItemSyncStrategy,
} from '@std-toolkit/tanstack-sync';
import { SettingsSchema } from '@/domain/index';
import { FinancesClient } from '@/routes/internal/effect';
import { run } from './utils.js';

const std = createStdSync();

export const settingsCollection = std.singleItemCollection({
  schema: SettingsSchema,
  strategy: singleItemSyncStrategy.getOnce({
    get: () =>
      run(
        Effect.gen(function* () {
          const { client } = yield* FinancesClient;
          return yield* client.getSettings({});
        }),
      ),
  }),
  onUpdate: (payload) =>
    run(
      Effect.gen(function* () {
        const { client } = yield* FinancesClient;
        return yield* client.putSettings(
          payload.updates as typeof SettingsSchema.Type,
        );
      }),
    ),
});

export const settingsUtils = settingsCollection.utils;
