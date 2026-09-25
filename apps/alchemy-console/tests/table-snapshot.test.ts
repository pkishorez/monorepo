import { expectTableSnapshot } from 'std-toolkit/snapshot/vitest';
import { it } from 'vite-plus/test';
import { consoleTable } from '../src/server/storage/table/index.ts';
// Entities register on the table as their modules load; the snapshot must see all of them.
import '../src/server/storage/credentials/index.ts';
import '../src/server/storage/stores/index.ts';

// The committed file is the console table's contract: every entity and every
// version of every schema it reaches. A change here is a
// change to what deployed rows mean, so review the diff before accepting it
// with `vitest -u`.
it('keeps the console table in step with its committed snapshot', async () => {
  await expectTableSnapshot(
    consoleTable,
    './fixtures/console-table.snapshot.json',
  );
});
