import { it } from 'vitest';
import { expectTableShippable } from '../../db/testing/index.js';
import { syncStore } from '../domain/stored-entity/index.js';

// The Sync Store lives in each user's IndexedDB, where no deploy guard runs:
// this test is the only thing between a schema edit and every user's replica.
it('keeps the Sync Store safe to ship', async () => {
  await expectTableShippable(syncStore, './fixtures/sync-store.snapshot.json');
});
