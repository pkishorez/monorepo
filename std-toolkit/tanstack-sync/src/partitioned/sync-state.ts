import { Effect, Schema } from 'effect';
import type { OfflineStorageGroup } from '../offline-storage/index.js';
import { storageError } from '../source-of-truth/index.js';
import type { WriteError } from '../source-of-truth/index.js';
import type { StrategyStateSpec } from './strategy-state.js';

export type PartitionMeta = {
  collectionName: string;
  partitionField: string;
  partitionValue: string;
  partitionKey: string;
  itemCount: number;
};

export const makeSyncStateStore = <TState = unknown>(args: {
  schemaName: string;
  strategyName: string;
  group: OfflineStorageGroup;
  state: StrategyStateSpec<TState>;
}): {
  get: (key: string) => Effect.Effect<TState, WriteError>;
  set: (
    key: string,
    state: TState,
    meta?: PartitionMeta,
  ) => Effect.Effect<void, WriteError>;
} => {
  type StoredStrategyState = {
    strategy: string;
    value: unknown;
    meta?: PartitionMeta;
  };

  const isStoredStrategyState = (
    value: unknown,
  ): value is StoredStrategyState => {
    if (value == null || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.strategy === 'string' && 'value' in candidate;
  };

  const emptyState = (): TState => structuredClone(args.state.empty);

  const baseMeta = (key: string, itemCount: number): PartitionMeta => ({
    collectionName: args.schemaName,
    partitionField: '',
    partitionValue: '',
    partitionKey: key,
    itemCount,
  });

  const putEnvelope = (key: string, value: unknown, meta: PartitionMeta) =>
    args.group
      .put<StoredStrategyState>(key, {
        strategy: args.strategyName,
        value,
        meta,
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
      yield* putEnvelope(key, state, baseMeta(key, 0));
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
            `[tanstack-sync] reset legacy sync state for "${args.schemaName}" strategy "${args.strategyName}" because it was missing the strategy-state envelope (strategy/value)`,
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
    set: (key, state, meta) =>
      putEnvelope(key, state, meta ?? baseMeta(key, 0)),
  };
};
