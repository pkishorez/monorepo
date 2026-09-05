import { Effect, Layer } from 'effect';
import { IDB } from '../../../db/idb/index.js';
import { syncStore } from '../../domain/stored-entity/index.js';
import type { StdSyncPlatform } from '../contract/index.js';
import { broadcastChannel } from './broadcast-channel.js';
import { connectivity } from './connectivity.js';
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
  const network = connectivity();
  return {
    storeLayer: configuredStore,
    leadershipLayer: webLockLeadership(),
    ...(channel ? { peerSync: { channel } } : {}),
    ...(network ? { connectivity: network } : {}),
  };
};

export { broadcastChannel } from './broadcast-channel.js';
