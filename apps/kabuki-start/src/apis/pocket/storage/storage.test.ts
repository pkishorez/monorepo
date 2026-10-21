import { it } from 'vitest';
import { expectTableShippable } from '@kestack/std-toolkit/snapshot/vitest';
import { pocketTable } from './index.ts';

// The committed file is the pocket table's contract: every entity and every
// version of every schema it reaches. `vitest -u` accepts only changes that
// keep stored rows readable; a breaking one needs a person to name it.
it('keeps the pocket table safe to ship', async () => {
  await expectTableShippable(pocketTable, './pocket-table.snapshot.json');
});
