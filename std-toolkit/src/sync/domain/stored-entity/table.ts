import { StdTable } from '../../../db/index.js';

export const SYNC_STORE_TABLE = 'sync-store';

export const syncStore = StdTable.make(SYNC_STORE_TABLE)
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .build();

export type OpaqueValue = {} | null;
