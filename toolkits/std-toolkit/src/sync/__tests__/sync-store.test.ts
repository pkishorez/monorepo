import { it } from 'vitest';
import { expectTableShippable } from '../../snapshot/vitest/index.js';
import { syncStore } from '../domain/stored-entity/index.js';

// The Sync Store lives in each user's IndexedDB, which no deploy checks: this
// test is the only check between a schema edit and every user's replica.
it('keeps the Sync Store safe to ship', async () => {
  await expectTableShippable(syncStore, './fixtures/sync-store.snapshot.json');
});
