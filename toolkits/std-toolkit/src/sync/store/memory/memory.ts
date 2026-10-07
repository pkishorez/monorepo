import { Memory } from '../../../db/memory/index.js';
import { syncStore } from '../../domain/stored-entity/index.js';
import { noDoorbell, noLeadership, type SyncStore } from '../contract/index.js';

/** Ephemeral storage and nothing shared: every participant syncs on its own. */
export const memory = (): SyncStore => ({
  table: () => Memory.make(syncStore).layer,
  leadership: noLeadership,
  doorbell: noDoorbell,
});

/** The Sync adapter for memory. */
export const Sync = { memory } as const;
