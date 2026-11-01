import { StdTable } from '../../../db/index.js';
import { storedReplicaCursorSchema } from './replica-cursor.js';
import { storedReplicaSchema } from './replica.js';
import { storedSyncStateSchema } from './sync-state.js';

export const SYNC_STORE_TABLE = 'sync-store';

export type OpaqueValue = {} | null;

export const syncStore = StdTable.make(SYNC_STORE_TABLE)
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .entity(storedReplicaSchema, (e) =>
    e
      .primary({ pk: ['collection'] })
      .index('LSI1', 'bySequence', { sk: ['seq'] }),
  )
  .entity(storedReplicaCursorSchema, (e) => e.primary({ pk: ['collection'] }))
  .entity(storedSyncStateSchema, (e) => e.primary({ pk: ['collection'] }))
  .build();

export const storedReplicaEntity = syncStore.SyncStoredReplica;
export const storedReplicaCursorEntity = syncStore.SyncStoredReplicaCursor;
export const storedSyncStateEntity = syncStore.SyncStoredState;
