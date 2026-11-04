import { it } from 'vitest';
import { expectUpgradable } from '../../eschema/testing/index.js';
import { TableSnapshotESchema } from '../index.js';

// The accepted snapshot lives in Alchemy state; every stored format must read.
it('every stored snapshot document format upgrades', async () => {
  await expectUpgradable(TableSnapshotESchema, { runs: 25 });
});
