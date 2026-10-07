import { Effect, ManagedRuntime } from 'effect';
import type { StdTableService } from '../../../db/index.js';
import type { SYNC_STORE_TABLE } from '../../domain/stored-entity/index.js';
import type { SyncTableLayer } from '../contract/index.js';

/** A Std Sync's table, opened once and shared by its Collections. */
export type StoreRuntime = {
  provide: <A, E>(
    effect: Effect.Effect<A, E, StdTableService<typeof SYNC_STORE_TABLE>>,
  ) => Effect.Effect<A, E>;
  dispose: () => Promise<void>;
};

export const makeStoreRuntime = (layer: SyncTableLayer): StoreRuntime => {
  const runtime = ManagedRuntime.make(layer);
  return {
    provide: (effect) =>
      runtime.contextEffect.pipe(
        Effect.flatMap((context) => Effect.provide(effect, context)),
      ),
    dispose: () => runtime.dispose(),
  };
};
