import { expectTableShippable } from '@kestack/std-toolkit/snapshot/vitest';
import { it } from 'vite-plus/test';
import { consoleTable } from '../src/server/storage/table/index.ts';
// Entities register on the table as their modules load; the snapshot must see all of them.
import '../src/server/storage/credentials/index.ts';
import '../src/server/storage/stores/index.ts';

// The committed file is the console table's contract: every entity and every
// version of every schema it reaches. `vitest -u` accepts only changes that
// keep stored rows readable; a breaking one needs a person to name it.
it('keeps the console table safe to ship', async () => {
  await expectTableShippable(
    consoleTable,
    './fixtures/console-table.snapshot.json',
  );
});
