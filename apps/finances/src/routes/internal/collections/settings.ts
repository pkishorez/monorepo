import { createCollection } from '@tanstack/react-db';
import { Effect } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { createStdSync } from '@std-toolkit/tanstack-sync';
import { CategorySettingSchema } from '@/domain/index';
import { FinancesClient } from '@/routes/internal/effect';

type CategorySetting = typeof CategorySettingSchema.Type;
const std = createStdSync();

const settingsSyncConfig = std.totalSync({
  schema: CategorySettingSchema,
  query: () =>
    Effect.gen(function* () {
      const { client } = yield* FinancesClient;
      const res = yield* client.listCategorySettings({});
      return res as EntityType<CategorySetting>[];
    }).pipe(Effect.provide(FinancesClient.Default), Effect.orDie),
  onInsert: (item) =>
    Effect.gen(function* () {
      const { client } = yield* FinancesClient;
      return yield* client.saveCategorySetting({
        category: item.category,
        type: item.type,
      });
    }).pipe(Effect.provide(FinancesClient.Default), Effect.orDie),
  onUpdate: (payload) =>
    Effect.gen(function* () {
      const { client } = yield* FinancesClient;
      return yield* client.saveCategorySetting({
        category: payload.category,
        type: 'spend',
        ...payload.updates,
      });
    }).pipe(Effect.provide(FinancesClient.Default), Effect.orDie),
});

export const settingsCollection = createCollection(settingsSyncConfig);
export const settingsUtils = settingsSyncConfig.utils;
