import { Memory } from '../../../db/memory/index.js';
import { syncStore } from '../../domain/stored-entity/index.js';
import {
  noDoorbell,
  noLeadership,
  type StdSyncPlatform,
} from '../contract/index.js';

/** Ephemeral storage and nothing shared: every participant syncs on its own. */
export const memory = (): StdSyncPlatform => ({
  store: () => Memory.make(syncStore).layer,
  leadership: noLeadership,
  doorbell: noDoorbell,
});
