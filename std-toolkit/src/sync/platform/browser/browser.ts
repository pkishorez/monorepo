import { Effect, Layer } from 'effect';
import { IDB } from '../../../db/idb/index.js';
import { syncStore } from '../../persistence/sync-store/index.js';
import type { StdSyncPlatform } from '../../sync.js';
import { broadcastChannel } from './broadcast-channel.js';
import { webLockLeadership } from './web-locks/index.js';

export const browser = (options?: {
  readonly databaseName?: string;
}): StdSyncPlatform => {
  const storeLayer = (databaseName: string) => {
    const store = IDB.make(syncStore, {
      database: IDB.database({ databaseName }),
    });
    return Layer.unwrap(Effect.orDie(Effect.as(store.setup, store.layer)));
  };
  const configuredStore = options?.databaseName
    ? storeLayer(options.databaseName)
    : (syncName: string) => storeLayer(`std-sync:${syncName}`);
  const channel = broadcastChannel();
  return {
    storeLayer: configuredStore,
    leadershipLayer: webLockLeadership(),
    ...(channel ? { peerSync: { channel } } : {}),
  };
};

export { broadcastChannel } from './broadcast-channel.js';
