import { it } from 'vitest';
import { expectUpgradable } from '../../eschema/testing/index.js';
import { TableSnapshotESchema } from '../index.js';

// A snapshot document lives in committed files and in deploy resources' props;
// every format one was written in must read.
it('every stored snapshot document format upgrades', async () => {
  await expectUpgradable(TableSnapshotESchema, { runs: 25 });
});
