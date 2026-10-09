import type { Storage } from '@kstackz/web-platform/define';

/** What hears every write to the ledger table on this device: on the web,
 * every tab, as they all write to the same IndexedDB database. */
export const broadcasterDevice = (storage: Storage) =>
  storage.broadcaster('local-backend');
