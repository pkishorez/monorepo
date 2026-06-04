import { createCollection } from '@tanstack/react-db';
import { Effect } from 'effect';
import { createStdSync } from '@std-toolkit/tanstack-sync';
import { SettingsSchema } from '@/domain/index';
import { FinancesClient } from '@/routes/internal/effect';

const std = createStdSync();

const settingsSyncConfig = std.singleItem({
  schema: SettingsSchema,
  get: () =>
    Effect.gen(function* () {
      const { client } = yield* FinancesClient;
      return yield* client.getSettings({});
    }).pipe(Effect.provide(FinancesClient.layer), Effect.orDie),
  onUpdate: ({ updates }) =>
    Effect.gen(function* () {
      const { client } = yield* FinancesClient;
      return yield* client.putSettings(updates);
    }).pipe(Effect.provide(FinancesClient.layer), Effect.orDie),
});

export const settingsCollection = createCollection(settingsSyncConfig);
export const settingsUtils = settingsSyncConfig.utils;
