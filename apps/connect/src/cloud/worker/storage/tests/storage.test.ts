import { it } from 'vitest';
import { expectTableShippable } from '@kestack/std-toolkit/db/testing';
import { connectionsTable } from '../index.js';

// The committed file is the connections table's contract: every entity and every
// version of every schema it reaches. `vitest -u` accepts only changes that
// keep stored rows readable; a breaking one needs a person to name it.
it('keeps the connections table safe to ship', async () => {
  await expectTableShippable(
    connectionsTable,
    './connections-table.snapshot.json',
  );
});
