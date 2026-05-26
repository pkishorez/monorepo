import { Effect, Option, Stream } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { makeEntityRpcHandlers } from '@std-toolkit/sqlite/rpc';
import { StdToolkitError } from '@std-toolkit/core/rpc';
import { type SqliteDB, SqliteDBError } from '@std-toolkit/sqlite';
import {
  OverrideSchema,
  ProjectionOutputSchema,
  SettingsSchema,
  TransactionSchema,
} from '../domain/index.js';
import { Db } from '../services/index.js';

const DEFAULT_STREAM_LIMIT = 500;
const HEARTBEAT_INTERVAL = '10 seconds';

type SyncEvent<T> =
  | { _tag: 'batch'; items: T[] }
  | { _tag: 'initial-sync-done' }
  | { _tag: 'heartbeat' };

type SyncState = {
  cursor: string | null;
  initialSyncDone: boolean;
};

type TimelineEntity<T> = {
  query: (
    key: never,
    params: never,
    options: { limit: number },
  ) => Effect.Effect<{ items: T[] }, SqliteDBError, SqliteDB>;
};

const mapError = (error: unknown, fallback: string): StdToolkitError =>
  error instanceof StdToolkitError
    ? error
    : new StdToolkitError({
        message: error instanceof SqliteDBError ? error.message : fallback,
      });

const makeSyncStream = <T>(
  entity: TimelineEntity<T>,
  payload: { cursor: string | null; limit?: number },
  fallback: string,
) =>
  Stream.unfoldEffect<SyncState, SyncEvent<T>, SqliteDBError, SqliteDB>(
    { cursor: payload.cursor, initialSyncDone: false },
    (state) =>
      Effect.gen(function* () {
        const result = yield* entity.query(
          'timeline' as never,
          { pk: {}, sk: { '>': state.cursor } } as never,
          { limit: payload.limit ?? DEFAULT_STREAM_LIMIT },
        );
        const last = result.items.at(-1) as
          | { meta: { _u: string } }
          | undefined;

        if (last) {
          const event: SyncEvent<T> = { _tag: 'batch', items: result.items };
          const nextState: SyncState = {
            cursor: last.meta._u,
            initialSyncDone: state.initialSyncDone,
          };
          return Option.some([event, nextState] as const);
        }

        if (!state.initialSyncDone) {
          const event: SyncEvent<T> = { _tag: 'initial-sync-done' };
          const nextState: SyncState = { ...state, initialSyncDone: true };
          return Option.some([event, nextState] as const);
        }

        yield* Effect.sleep(HEARTBEAT_INTERVAL);
        const event: SyncEvent<T> = { _tag: 'heartbeat' };
        return Option.some([event, state] as const);
      }),
  ).pipe(Stream.mapError((error) => mapError(error, fallback)));

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
            : db.override.insert(payload),
        ),
        Effect.mapError((e) => mapError(e, 'Save override failed')),
      ),

    subscribeOverrides: (payload: { cursor: string | null; limit?: number }) =>
      makeSyncStream(
        db.override as TimelineEntity<EntityType<typeof OverrideSchema.Type>>,
        payload,
        'Subscribe overrides failed',
      ),
  };
});

export const TransactionHandlersLive = Effect.gen(function* () {
  const db = yield* Db;

  return {
    replaceTransactions: (payload: typeof ProjectionOutputSchema.Type) =>
      db.registry
        .transaction(
          Effect.gen(function* () {
            yield* db.transaction.hardDelete();
            return yield* Effect.forEach(payload.transactions, (transaction) =>
              db.transaction.insert(transaction),
            );
          }),
        )
        .pipe(
          Effect.mapError((e) => mapError(e, 'Replace transactions failed')),
        ),

    subscribeTransactions: (payload: {
      cursor: string | null;
      limit?: number;
    }) =>
      makeSyncStream(
        db.transaction as TimelineEntity<
          EntityType<typeof TransactionSchema.Type>
        >,
        payload,
        'Subscribe transactions failed',
      ),
  };
});

export const SettingsHandlersLive = Effect.gen(function* () {
  const db = yield* Db;

  return {
    getSettings: () =>
      db.settings
        .get()
        .pipe(Effect.mapError((e) => mapError(e, 'Get settings failed'))),

    putSettings: (payload: typeof SettingsSchema.Type) =>
      db.settings
        .put(payload)
        .pipe(Effect.mapError((e) => mapError(e, 'Put settings failed'))),
  };
});
