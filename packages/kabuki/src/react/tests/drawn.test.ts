import { describe, expect, it } from 'vitest';
import type { Instance, Snapshot } from '../../core/index.ts';
import { makeDrawn } from '../app/index.ts';

/* What Views read lets go of an Instance once it is in no Snapshot drawn. */

const instance = (
  id: string,
  children: Instance['children'] = {},
): Instance => ({
  id,
  actor: 'A',
  state: { _tag: 'Single' },
  model: {},
  children,
  invoked: {},
});

describe('what Views read', () => {
  it('forgets a keyed Child once it is gone from the Snapshot', () => {
    const row = instance('List/rows[a]#1');
    const full: Snapshot = instance('List', { rows: [row] });
    const empty: Snapshot = instance('List', { rows: [] });
    let now = full;
    const drawn = makeDrawn(
      () => now,
      () => undefined,
      () => {},
      () => () => {},
    );
    const before = drawn.instance(row.id)!;
    expect(drawn.instance(row.id)).toBe(before);

    now = empty;
    expect(drawn.instance('List')).toBeDefined();
    expect(drawn.instance(row.id)).toBeUndefined();

    // Back again, as when the past is shown: drawn anew, nothing was kept.
    now = full;
    const after = drawn.instance(row.id)!;
    expect(after).not.toBe(before);
    expect(after.send).not.toBe(before.send);
  });
});
