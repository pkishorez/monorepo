import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import { expectTableShippable } from '@kestack/std-toolkit/snapshot/vitest';
import { ConnectionRecord, connectionsTable } from '../index.js';

// The committed file is the connections table's contract: every entity and every
// version of every schema it reaches. `vitest -u` accepts only changes that
// keep stored rows readable; a breaking one needs a person to name it.
it('keeps the connections table safe to ship', async () => {
  await expectTableShippable(
    connectionsTable,
    './connections-table.snapshot.json',
  );
});

const URL = 'https://t1.example';

/** A row as v3 stored it, with `status`. */
const v3 = (status: Record<string, unknown>) => ({
  _v: 'v3',
  id: 'c1',
  name: 'laptop',
  key: 'k',
  version: '0.0.6',
  status,
  userId: 'u1',
  lastSeen: 1,
  signInId: null,
  forgottenAt: null,
  displayName: null,
});

describe('a Connection stored before its status was the State of the Tunnel', () => {
  const read = Schema.decodeUnknownSync(ConnectionRecord.schema);

  it.each([
    [
      { _tag: 'Installing' },
      {
        _tag: 'SettingUp',
        step: { _tag: 'Downloading', elapsed: 0, received: 0 },
      },
    ],
    [{ _tag: 'Opening' }, { _tag: 'SettingUp', step: { _tag: 'Opening' } }],
    [
      { _tag: 'OpenFailed', at: 5, problem: 'no route' },
      {
        _tag: 'SettingUp',
        step: { _tag: 'Failed', at: 5, problem: 'no route' },
      },
    ],
    [
      { _tag: 'Unchecked', url: URL },
      { _tag: 'Ready', url: URL, check: { _tag: 'Unchecked' } },
    ],
    [
      { _tag: 'Reachable', url: URL, at: 5 },
      { _tag: 'Ready', url: URL, check: { _tag: 'Reachable', at: 5 } },
    ],
    [
      { _tag: 'Unreachable', url: URL, at: 5, problem: 'timed out' },
      {
        _tag: 'Ready',
        url: URL,
        check: { _tag: 'Unreachable', at: 5, problem: 'timed out' },
      },
    ],
  ])('reads %j', (old, now) => {
    expect(read(v3(old)).status).toEqual(now);
  });

  it('reads at every version it could have been stored at', async () => {
    await expectUpgradable(ConnectionRecord);
  });
});
