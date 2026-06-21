import { createCollection } from '@tanstack/react-db';
import { Effect } from 'effect';
import {
  createStdSync,
  singleItemSyncStrategy,
} from '@std-toolkit/tanstack-sync';
import { SettingsSchema } from '@/domain/index';
import { FinancesClient } from '@/routes/internal/effect';
import { run } from './utils.js';

const std = createStdSync();

const settingsSyncConfig = std.singleItemSync({
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

export const settingsCollection = createCollection(settingsSyncConfig);
export const settingsUtils = settingsSyncConfig.utils;
