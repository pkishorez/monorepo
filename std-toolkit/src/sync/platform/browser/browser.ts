import { Effect, Layer } from 'effect';
import { IDB } from '../../../db/idb/index.js';
import { syncStore } from '../../persistence/sync-store/index.js';
import type { StdSyncPlatform } from '../../sync.js';
import { broadcastChannel } from './broadcast-channel.js';
import { webLockLeadership } from './web-locks/index.js';

export const browser = (options?: {
  readonly databaseName?: string;
}): StdSyncPlatform => {
  const store = IDB.make(syncStore, {
    database: IDB.database({
      databaseName: options?.databaseName ?? 'std-sync',
    }),
  });
  const channel = broadcastChannel();
  return {
    storeLayer: Layer.unwrap(Effect.orDie(Effect.as(store.setup, store.layer))),
    leadershipLayer: webLockLeadership(),
    ...(channel ? { peerSync: { channel } } : {}),
  };
};

export { broadcastChannel } from './broadcast-channel.js';
