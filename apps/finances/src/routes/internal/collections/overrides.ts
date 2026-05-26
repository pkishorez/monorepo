import { createCollection } from '@tanstack/react-db';
import { Effect } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { createStdSync } from '@std-toolkit/tanstack-sync';
import { OverrideSchema } from '@/domain/index';
import { FinancesClient } from '@/routes/internal/effect';

type Override = typeof OverrideSchema.Type;
const std = createStdSync();

const overridesSyncConfig = std.totalSync({
  schema: OverrideSchema,
  query: () =>
    Effect.gen(function* () {
      const { client } = yield* FinancesClient;
      const res = yield* client.listOverrides({});
      return res as EntityType<Override>[];
    }).pipe(Effect.provide(FinancesClient.Default), Effect.orDie),
  onInsert: (item) =>
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
    }).pipe(Effect.provide(FinancesClient.Default), Effect.orDie),
  onUpdate: (payload) =>
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
    }).pipe(Effect.provide(FinancesClient.Default), Effect.orDie),
});

export const overridesCollection = createCollection(overridesSyncConfig);
export const overridesUtils = overridesSyncConfig.utils;
