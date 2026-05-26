import { Effect } from 'effect';
import { makeEntityRpcHandlers } from '@std-toolkit/sqlite/rpc';
import { StdToolkitError } from '@std-toolkit/core/rpc';
import { SqliteDBError } from '@std-toolkit/sqlite';
import { OverrideSchema } from '../domain/index.js';
import { Db } from '../services/index.js';

export const OverrideHandlersLive = Effect.gen(function* () {
  const db = yield* Db;
  const entityHandlers = makeEntityRpcHandlers(db.override, OverrideSchema);

  return {
    ...entityHandlers,
    saveOverride: (payload: typeof OverrideSchema.Type) =>
      db.override.get({ transactionId: payload.transactionId }).pipe(
        Effect.flatMap((existing) =>
          existing
            ? db.override.update(
                { transactionId: payload.transactionId },
                {
                  category: payload.category,
                  subcategory: payload.subcategory,
                  notes: payload.notes,
                  verified: payload.verified,
                  ignore: payload.ignore,
                  cancelled_by: payload.cancelled_by,
                },
              )
            : db.override.insert(payload as never),
        ),
        Effect.mapError((e) =>
          e instanceof StdToolkitError
            ? e
            : new StdToolkitError({
                message:
                  e instanceof SqliteDBError
                    ? e.message
                    : 'Save override failed',
              }),
        ),
      ),

    listOverrides: () =>
      db.override.query('primary', { sk: { '>': null } }).pipe(
        Effect.map((result) => result.items),
        Effect.mapError((e) =>
          e instanceof StdToolkitError
            ? e
            : new StdToolkitError({
                message:
                  e instanceof SqliteDBError
                    ? e.message
                    : 'List overrides failed',
              }),
        ),
      ),
  };
});

export const CategorySettingHandlersLive = Effect.gen(function* () {
  const db = yield* Db;

  return {
    saveCategorySetting: (payload: {
      category: string;
      type: 'income' | 'spend' | 'transfer' | 'ignore';
    }) =>
      db.categorySetting.get({ category: payload.category }).pipe(
        Effect.flatMap((existing) =>
          existing
            ? db.categorySetting.update(
                { category: payload.category },
                { type: payload.type },
              )
            : db.categorySetting.insert(payload as never),
        ),
        Effect.mapError((e) =>
          e instanceof StdToolkitError
            ? e
            : new StdToolkitError({
                message:
                  e instanceof SqliteDBError
                    ? e.message
                    : 'Save category setting failed',
              }),
        ),
      ),

    listCategorySettings: () =>
      db.categorySetting.query('primary', { sk: { '>': null } }).pipe(
        Effect.map((result) => result.items),
        Effect.mapError((e) =>
          e instanceof StdToolkitError
            ? e
            : new StdToolkitError({
                message:
                  e instanceof SqliteDBError
                    ? e.message
                    : 'List category settings failed',
              }),
        ),
      ),

    deleteCategorySetting: (payload: { category: string }) =>
      db.categorySetting.delete({ category: payload.category }).pipe(
        Effect.mapError((e) =>
          e instanceof StdToolkitError
            ? e
            : new StdToolkitError({
                message:
                  e instanceof SqliteDBError
                    ? e.message
                    : 'Delete category setting failed',
              }),
        ),
      ),
  };
});
