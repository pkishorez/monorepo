import { it } from 'vitest';
import { expectTableShippable } from '@kestack/std-toolkit/snapshot/vitest';
import { aiTable } from '../table.js';

// The table lives in a SQLite file on every computer that runs the Plugin, and
// its setup refuses a breaking change at start, so a breaking change would
// stop the Plugin everywhere. The committed file is the table's contract:
// every entity and every version of every schema it reaches. `vitest -u`
// accepts only changes that keep stored rows readable.
it('keeps the code Plugin’s table safe to ship', async () => {
  await expectTableShippable(aiTable, './ai-table.snapshot.json');
});
