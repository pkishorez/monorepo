import { Effect, Schema } from 'effect';
import { EntitySchema, findOutdatedVersion } from '../../../core/index.js';
import type { DatabaseError } from '../../../db/index.js';
import type { AnyESchema } from '../../../eschema/index.js';
import {
  storageError,
  type WriteError,
} from '../../domain/sync-error/index.js';
import type { StateEntitySchema, StrategyStateSpec } from './strategy-state.js';
import {
  storedSyncStateEntity,
  type StoredSyncStateValue,
} from '../../domain/stored-entity/index.js';
import type { SyncStore } from '../../platform/sync-store/index.js';

const storeError = (reason: string) => (cause: DatabaseError) =>
  storageError(reason, cause);

const invalid = (cause: { readonly message: string }): WriteError => ({
  _tag: 'Invalid',
  reason: cause.message,
  cause,
});

export const makeSyncStateStore = <TState = unknown>(args: {
  schema: AnyESchema;
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
  // The one codec for the whole state. Entities inside it use the Collection's
  // Entity codec, so a cursor is stored encoded and migrated when read back.
  const stateSchema = args.state.schema(
    EntitySchema(args.schema) as unknown as StateEntitySchema,
  );
  const encode = (state: TState) =>
    Schema.encodeEffect(stateSchema)(state).pipe(Effect.mapError(invalid));

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
      yield* putStoredState(key, yield* encode(state));
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

        return yield* Schema.decodeUnknownEffect(stateSchema)(
          stored.value.value,
        ).pipe(
          Effect.catch((cause) => {
            const outdated = findOutdatedVersion(cause);
            return outdated
              ? Effect.fail(invalid(outdated))
              : reset(
                  key,
                  `[sync] reset sync state for "${args.schemaName}" strategy "${args.strategyName}" because stored state failed schema validation`,
                );
          }),
        );
      }),
    set: (key, state) =>
      encode(state).pipe(
        Effect.flatMap((encoded) => putStoredState(key, encoded)),
      ),
  };
};
