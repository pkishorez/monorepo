import { it } from 'vitest';
import { expectTableShippable } from '@kestack/std-toolkit/snapshot/vitest';
import { keConnectTable } from '../real/index.js';

it('keeps the ke-connect table safe to ship, the same as v1 kept it', async () => {
  await expectTableShippable(
    keConnectTable,
    './ke-connect-table.snapshot.json',
  );
});
