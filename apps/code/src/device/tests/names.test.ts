import { describe, expect, it } from 'vitest';
import { device } from '../store.ts';
import { account, accounts } from '../account/store/index.ts';
import { machine, machines } from '../account/machines/store.ts';
import { sync } from '../account/machines/machine/store/index.ts';

/** Each level's names, as one place reads them. */
const names = { device, accounts, account, machines, machine, sync };

/*
 * Each level names its own database: the device's, an Account's, a
 * Machine's, and its sync Stores. Each name is its place in the tree, so one prune by prefix and segment
 * takes an Account or a Machine with all under it, and nothing beside it.
 */

/** The segment `IDB.prune` keeps or deletes `name` by, under `prefix`. */
const segmentAfter = (prefix: string, name: string) => {
  expect(name.startsWith(prefix)).toBe(true);
  return name.slice(prefix.length).split(':')[0];
};

describe('storage names', () => {
  it('names each database by its place', () => {
    expect(names.device).toBe('code:device');
    expect(names.account('a1')).toBe('code:account:a1');
    expect(names.machine('a1', 'm1')).toBe('code:account:a1:machine:m1');
    expect(names.sync('a1', 'm1')).toBe('code:account:a1:machine:m1:sync:');
  });

  it('puts every database of an Account under its id', () => {
    for (const name of [
      names.account('a1'),
      names.machine('a1', 'm1'),
      `${names.sync('a1', 'm1')}code-m1`,
    ])
      expect(segmentAfter(names.accounts, name)).toBe('a1');
  });

  it('puts every database of a Machine under its id', () => {
    for (const name of [
      names.machine('a1', 'm1'),
      `${names.sync('a1', 'm1')}code-m1`,
    ])
      expect(segmentAfter(names.machines('a1'), name)).toBe('m1');
  });

  it('keeps the device apart from every Account', () => {
    expect(names.device.startsWith(names.accounts)).toBe(false);
    expect(names.account('a1').startsWith(names.machines('a1'))).toBe(false);
  });
});
