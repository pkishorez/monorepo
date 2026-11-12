import { describe, expect, it } from 'vitest';
import type { Address, Instance, Snapshot } from '../../core/index.ts';
import { makeDrawn } from '../view/drawn.ts';

/* What Views read lets go of an Instance once it is in no Snapshot drawn. */

const instance = (
  address: string,
  children: Instance['children'] = {},
): Instance => ({
  address: address as Address,
  actor: 'A',
  state: { _tag: 'Single' },
  model: {},
  started: null,
  changed: null,
  children,
  invoked: {},
});

const at = (root: Instance): Snapshot => ({ entry: null, root });

describe('what Views read', () => {
  it('forgets a keyed Child once it is gone from the Snapshot', () => {
    const row = instance('List/rows[a]#1');
    const full = at(instance('List', { rows: [row] }));
    const empty = at(instance('List', { rows: [] }));
    let now = full;
    const drawn = makeDrawn(
      () => now,
      () => undefined,
      () => {},
      () => () => {},
    );
    const before = drawn.instance(row.address)!;
    expect(drawn.instance(row.address)).toBe(before);

    now = empty;
    expect(drawn.instance('List' as Address)).toBeDefined();
    expect(drawn.instance(row.address)).toBeUndefined();

    // Back again, as when the past is shown: drawn anew, nothing was kept.
    now = full;
    const after = drawn.instance(row.address)!;
    expect(after).not.toBe(before);
    expect(after.send).not.toBe(before.send);
  });
});
