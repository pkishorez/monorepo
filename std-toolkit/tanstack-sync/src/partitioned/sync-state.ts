import { Effect, Schema } from 'effect';
import type { OfflineStorageGroup } from '../offline-storage/index.js';
import { storageError } from '../source-of-truth/index.js';
import type { WriteError } from '../source-of-truth/index.js';
import type { StrategyStateSpec } from './strategy-state.js';

/**
 * Per-collection+partition strategy-owned state store, keyed by partition key.
 * State is opaque to the engine — only the owning strategy interprets it.
 */
export const makeSyncStateStore = <TState = unknown>(args: {
  schemaName: string;
  strategyName: string;
  group: OfflineStorageGroup;
  state: StrategyStateSpec<TState>;
}): {
  get: (key: string) => Effect.Effect<TState, WriteError>;
  set: (key: string, state: TState) => Effect.Effect<void, WriteError>;
} => {
  type StoredStrategyState = {
    strategy: string;
    value: unknown;
  };

  const isStoredStrategyState = (
    value: unknown,
  ): value is StoredStrategyState => {
    if (value == null || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.strategy === 'string' && 'value' in candidate;
  };

  const emptyState = (): TState => structuredClone(args.state.empty);

  const putEnvelope = (key: string, state: TState) =>
    args.group
      .put<StoredStrategyState>(key, {
        strategy: args.strategyName,
        value: state,
      })
      .pipe(
        Effect.mapError((cause) =>
          storageError('failed to write Sync State', cause),
        ),
      );

  const reset = (
    key: string,
    message: string,
  ): Effect.Effect<TState, WriteError> =>
    Effect.gen(function* () {
      const state = emptyState();
      yield* Effect.sync(() => console.warn(message));
      yield* putEnvelope(key, state);
      return state;
    });

  return {
    get: (key) =>
      Effect.gen(function* () {
        const stored = yield* args.group
          .get<unknown>(key)
          .pipe(
            Effect.mapError((cause) =>
              storageError('failed to read Sync State', cause),
            ),
          );

        if (stored == null) return emptyState();

        if (!isStoredStrategyState(stored)) {
          return yield* reset(
            key,
            `[tanstack-sync] reset legacy sync state for "${args.schemaName}" strategy "${args.strategyName}" because it was not stored in the strategy-state envelope`,
          );
        }

        if (stored.strategy !== args.strategyName) {
          return yield* reset(
            key,
            `[tanstack-sync] reset sync state for "${args.schemaName}" because stored strategy "${stored.strategy}" does not match current strategy "${args.strategyName}"`,
          );
        }

        const decoded = Schema.decodeUnknownEffect(args.state.schema)(
          stored.value,
        ).pipe(
          Effect.catch(() =>
            reset(
              key,
              `[tanstack-sync] reset sync state for "${args.schemaName}" strategy "${args.strategyName}" because stored state failed schema validation`,
            ),
          ),
        );
        return yield* decoded;
      }),
    set: (key, state) => putEnvelope(key, state),
  };
};
