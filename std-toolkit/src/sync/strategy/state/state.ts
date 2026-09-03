import { Effect, Schema } from 'effect';
import type { DatabaseError } from '../../../db/index.js';
import {
  storageError,
  type WriteError,
} from '../../domain/sync-error/index.js';
import type { StrategyStateSpec } from './strategy-state.js';
import {
  storedSyncStateEntity,
  type StoredSyncStateValue,
} from '../../domain/stored-entity/index.js';
import type { SyncStore } from '../../platform/sync-store/index.js';

const storeError = (reason: string) => (cause: DatabaseError) =>
  storageError(reason, cause);

export const makeSyncStateStore = <TState = unknown>(args: {
  schemaName: string;
  strategyName: string;
  store: SyncStore;
  state: StrategyStateSpec<TState>;
}): {
  get: (key: string) => Effect.Effect<TState, WriteError>;
  set: (key: string, state: TState) => Effect.Effect<void, WriteError>;
} => {
  const storageKey = (key: string) => ({
    collection: args.schemaName,
    key,
  });
  const emptyState = (): TState => structuredClone(args.state.empty);

  const putStoredState = (
    key: string,
    value: unknown,
  ): Effect.Effect<void, WriteError> => {
    const stored: StoredSyncStateValue = {
      collection: args.schemaName,
      key,
      strategy: args.strategyName,
      value: value as {} | null,
    };
    const update = () =>
      args.store.provide(
        storedSyncStateEntity.getAndUpdate(
          storageKey(key),
          { strategy: stored.strategy, value: stored.value },
          { lastWriteWins: true },
        ),
        {
          collection: args.schemaName,
          operation: 'update',
          record: 'sync-state',
          strategy: args.strategyName,
        },
      );
    return args.store
      .provide(storedSyncStateEntity.insert(stored), {
        collection: args.schemaName,
        operation: 'insert',
        record: 'sync-state',
        strategy: args.strategyName,
      })
      .pipe(
        Effect.catch((error) =>
          error.reason._tag === 'ItemAlreadyExists'
            ? update()
            : Effect.fail(error),
        ),
        Effect.asVoid,
        Effect.mapError(storeError('failed to write Sync State')),
      );
  };

  const reset = (
    key: string,
    message: string,
  ): Effect.Effect<TState, WriteError> =>
    Effect.gen(function* () {
      const state = emptyState();
      yield* Effect.logWarning(message);
      yield* putStoredState(key, state);
      return state;
    });

  return {
    get: (key) =>
      Effect.gen(function* () {
        const stored = yield* args.store
          .provide(storedSyncStateEntity.get(storageKey(key)), {
            collection: args.schemaName,
            operation: 'get',
            record: 'sync-state',
            strategy: args.strategyName,
          })
          .pipe(Effect.mapError(storeError('failed to read Sync State')));

        if (stored == null) return emptyState();
        if (stored.value.strategy !== args.strategyName) {
          return yield* reset(
            key,
            `[sync] reset sync state for "${args.schemaName}" because stored strategy "${stored.value.strategy}" does not match current strategy "${args.strategyName}"`,
          );
        }

        return yield* Schema.decodeUnknownEffect(args.state.schema)(
          stored.value.value,
        ).pipe(
          Effect.catch(() =>
            reset(
              key,
              `[sync] reset sync state for "${args.schemaName}" strategy "${args.strategyName}" because stored state failed schema validation`,
            ),
          ),
        );
      }),
    set: putStoredState,
  };
};
