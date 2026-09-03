import type { Connectivity } from '../../domain/connectivity/index.js';
import type { PeerChannelFactory } from '../../domain/peer-channel/index.js';
import type { LeadershipLayer } from '../leadership/index.js';
import type { SyncStoreLayer } from '../sync-store/index.js';

export type StdSyncPlatform = {
  readonly storeLayer?: SyncStoreLayer | ((syncName: string) => SyncStoreLayer);
  readonly leadershipLayer?: LeadershipLayer;
  readonly peerSync?: { readonly channel: PeerChannelFactory };
  readonly connectivity?: Connectivity;
};
