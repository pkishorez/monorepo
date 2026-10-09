import type { Storage } from '@kstackz/web-platform/define';
import { ledgerTable } from './table.ts';

/** The ledger table on this device, in a database of its own (named
 * `local-backend` from before the Backends were renamed, so what it holds
 * stays). */
export const tableDevice = (storage: Storage) =>
  storage.table(ledgerTable, 'local-backend');
