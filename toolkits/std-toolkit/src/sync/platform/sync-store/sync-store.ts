import { Effect, ManagedRuntime } from 'effect';
import type { StdTableService } from '../../../db/index.js';
import type { SYNC_STORE_TABLE } from '../../domain/stored-entity/index.js';
import type { SyncStoreLayer } from '../contract/index.js';

export type SyncStore = {
  provide: <A, E>(
    effect: Effect.Effect<A, E, StdTableService<typeof SYNC_STORE_TABLE>>,
  ) => Effect.Effect<A, E>;
  dispose: () => Promise<void>;
};

export const makeSyncStore = (layer: SyncStoreLayer): SyncStore => {
  const runtime = ManagedRuntime.make(layer);
  return {
    provide: (effect) =>
      runtime.contextEffect.pipe(
        Effect.flatMap((context) => Effect.provide(effect, context)),
      ),
    dispose: () => runtime.dispose(),
  };
};
