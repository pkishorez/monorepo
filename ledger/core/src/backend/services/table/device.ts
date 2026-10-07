import type { Platform } from '@kstackz/auth-toolkit/client';
import { ledgerTable } from './table.ts';

/** The ledger table on this device, in a database of its own (named
 * `local-backend` from before the Backends were renamed, so what it holds
 * stays). */
export const tableDevice = (platform: Platform) =>
  platform.storage.table(ledgerTable, 'local-backend');
