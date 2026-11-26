import { it } from 'vitest';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import { expectTableShippable } from '@kestack/std-toolkit/snapshot/vitest';
import { ConnectionRecord, connectionsTable } from '../real/index.js';

it('keeps the connections table safe to ship', async () => {
  await expectTableShippable(
    connectionsTable,
    './connections-table.snapshot.json',
  );
});

it('reads a Connection at every version it could have been stored at', async () => {
  await expectUpgradable(ConnectionRecord);
});
