import { it } from 'vitest';
import { expectTableShippable } from '@kestack/std-toolkit/snapshot/vitest';
import { machinesTable } from '../index.js';

// The committed file is the machines table's contract: every entity and every
// version of every schema it reaches. `vitest -u` accepts only changes that
// keep stored rows readable; a breaking one needs a person to name it.
it('keeps the machines table safe to ship', async () => {
  await expectTableShippable(machinesTable, './machines-table.snapshot.json');
});
