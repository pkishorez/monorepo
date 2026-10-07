import { Effect, Schema } from 'effect';
import type { AnyEntityESchema } from '../../eschema/index.js';
import { findOutdatedVersion } from '../../eschema/index.js';
import { storedSyncStateEntity } from '../domain/stored-entity/index.js';
import { storageError, type WriteError } from '../domain/sync-error/index.js';
import type { StoreRuntime } from '../store/store-runtime/index.js';
import type { StateEntitySchema, SyncStrategy } from '../strategy/index.js';
import type { ExtraOp } from './replica.js';

const invalid = (cause: { readonly message: string }): WriteError => ({
  _tag: 'Invalid',
  reason: cause.message,
  cause,
});

/**
 * Saved Sync State for one strategy, one row per scope. State saved by a
 * different strategy, or that no longer decodes, starts over from the
 * strategy's initial state; state from newer code fails as outdated.
 */
export const makeSyncStateStore = <TState>(args: {
  store: StoreRuntime;
  schema: AnyEntityESchema;
  collection: string;
  strategy: SyncStrategy<any, TState, any>;
}) => {
  const { collection, strategy, store } = args;
  const codec = strategy.state(
    args.schema.entity as unknown as StateEntitySchema,
  );
  const encode = Schema.encodeEffect(codec);
  const decode = Schema.decodeUnknownEffect(codec);
  const keyOf = (scope: string) => ({ collection, key: scope });

  const load = (scope: string): Effect.Effect<TState, WriteError> =>
    Effect.gen(function* () {
      const stored = yield* store
        .provide(storedSyncStateEntity.get(keyOf(scope)))
        .pipe(
          Effect.mapError((cause) =>
            storageError('failed to read Sync State', cause),
          ),
        );
      if (stored === null || stored.value.strategy !== strategy.name)
        return strategy.initial;
      return yield* decode(stored.value.value).pipe(
        Effect.catch((cause) =>
          findOutdatedVersion(cause)
            ? Effect.fail(invalid(cause))
            : Effect.logWarning(
                `[sync] Sync State of "${collection}" (${strategy.name}) no longer decodes; starting over`,
              ).pipe(Effect.as(strategy.initial)),
        ),
      );
    });

  // Written in the same transaction as the Entities it follows.
  const save = (scope: string, state: TState): ExtraOp =>
    Effect.gen(function* () {
      const value = (yield* encode(state).pipe(
        Effect.mapError(invalid),
      )) as {} | null;
      const exists = yield* storedSyncStateEntity
        .get(keyOf(scope))
        .pipe(
          Effect.mapError((cause) =>
            storageError('failed to read Sync State', cause),
          ),
        );
      const op =
        exists === null
          ? storedSyncStateEntity.insertOp({
              ...keyOf(scope),
              strategy: strategy.name,
              value,
            })
          : storedSyncStateEntity.getAndUpdateOp(
              keyOf(scope),
              { strategy: strategy.name, value },
              { lastWriteWins: true },
            );
      return yield* op.pipe(
        Effect.mapError((cause) =>
          storageError('failed to write Sync State', cause),
        ),
      );
    });

  return { load, save };
};
