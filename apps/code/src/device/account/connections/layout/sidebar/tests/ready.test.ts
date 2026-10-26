import { describe, expect, it } from 'vitest';
import { readyOf } from '../actor.ts';
import type { Read } from '../list/rows/drawn.ts';

/*
 * When the sidebar can be drawn whole, so Layout first draws it with its
 * rows and never its header alone: once its width, the kept list, the
 * Connection Filter, and each Connection shown, its Projects, Sessions and
 * Unseen marks, are read from this device. Cloud Connect and the Connections
 * answering are never waited for.
 */

const model = {
  listRead: true,
  connections: [
    { id: 'm1', name: 'One' },
    { id: 'm2', name: 'Two' },
  ],
  problem: null,
  filterRead: true,
  chosen: null,
  width: 280,
  unseen: { m1: {}, m2: {} },
  moving: [],
  told: null,
  refused: null,
  refusals: {},
  asking: {},
  ready: false,
};

const read = (
  connectionId: string,
  status: 'loading' | 'ready' | 'failed' = 'ready',
): Read<{ readonly id: string }> => ({
  props: { connectionId },
  model: {
    status,
    rows: [{ row: { id: `${connectionId}-row` } }],
    neverSynced: [],
  },
});

const both = [read('m1'), read('m2')];

describe('the sidebar, ready', () => {
  it('is ready once every Connection shown is read from this device', () => {
    expect(readyOf(model, both, both)).toBe(true);
  });

  it('waits for its width, so the screen is never drawn without it', () => {
    expect(readyOf({ ...model, width: null }, both, both)).toBe(false);
  });

  it('waits for the kept list and the Connection Filter', () => {
    expect(readyOf({ ...model, listRead: false }, both, both)).toBe(false);
    expect(readyOf({ ...model, filterRead: false }, both, both)).toBe(false);
  });

  it('waits for each Connection shown, its rows and its Unseen marks', () => {
    expect(readyOf(model, [read('m1')], both)).toBe(false);
    expect(readyOf(model, both, [read('m1'), read('m2', 'loading')])).toBe(
      false,
    );
    expect(readyOf({ ...model, unseen: { m1: {} } }, both, both)).toBe(false);
  });

  it('reads only the Connection chosen', () => {
    const chosen = { ...model, chosen: 'm1', unseen: { m1: {} } };
    expect(readyOf(chosen, [read('m1')], [read('m1')])).toBe(true);
  });

  it('is ready with no Connection listed, or none kept: nothing to read', () => {
    expect(readyOf({ ...model, connections: [] }, [], [])).toBe(true);
    expect(readyOf({ ...model, connections: null }, [], [])).toBe(true);
  });

  it('counts a Connection whose read failed as read, never waiting on it', () => {
    expect(readyOf(model, [read('m1'), read('m2', 'failed')], both)).toBe(true);
  });
});
