import { describe, expect, it } from 'vitest';
import { across } from '../../../../../connection/records/index.ts';
import { readOf } from '../../../actor.ts';
import { drawnOf, keptOf, type Read } from '../drawn.ts';

/*
 * What the sidebar draws, and when: nothing until the list kept here and
 * the Connection Filter are read; then nothing of the Connections shown until
 * each one's Projects, Sessions and Unseen marks are read, then all at
 * once; while Connections newly shown are read, the last whole read stays;
 * and each Connection is read by a Query of its own, so a change to the list
 * or the Filter never starts over a Connection still shown.
 */

const project = (connectionId: string, id: string) => ({ id, connectionId });
const session = (connectionId: string, id: string) => ({ id, connectionId });

const read = <Row>(
  connectionId: string,
  status: 'loading' | 'ready',
  rows: ReadonlyArray<Row>,
  neverSynced: ReadonlyArray<string> = [],
): Read<Row> => ({
  props: { connectionId },
  model: { status, rows: rows.map((row) => ({ row })), neverSynced },
});

const marked = () => true;

describe('the sidebar’s read', () => {
  it('is nothing while any Connection shown is still read', () => {
    const projects = [read('m1', 'ready', [project('m1', 'p1')])];
    // m2's Projects not started, m1's Sessions still loading.
    expect(
      drawnOf(
        ['m1', 'm2'],
        projects,
        [read('m1', 'ready', [session('m1', 's1')])],
        marked,
      ),
    ).toBeNull();
    expect(
      drawnOf(['m1'], projects, [read('m1', 'loading', [])], marked),
    ).toBeNull();
  });

  it('waits for each Connection’s Unseen marks, so no row turns bold after', () => {
    const projects = [read('m1', 'ready', [])];
    const sessions = [read('m1', 'ready', [session('m1', 's1')])];
    expect(drawnOf(['m1'], projects, sessions, () => false)).toBeNull();
    expect(drawnOf(['m1'], projects, sessions, marked)).not.toBeNull();
  });

  it('draws every Connection shown at once, in order, under one key', () => {
    const drawn = drawnOf(
      ['m1', 'm2'],
      [
        read('m2', 'ready', [project('m2', 'p2')], ['code·m2']),
        read('m1', 'ready', [project('m1', 'p1')]),
      ],
      [
        read('m1', 'ready', [session('m1', 's1')]),
        read('m2', 'ready', [session('m2', 's2')]),
      ],
      marked,
    );
    expect(drawn?.key).toBe('m1 m2');
    expect(drawn?.projects.map(({ id }) => id)).toEqual(['p1', 'p2']);
    expect(drawn?.sessions.map(({ id }) => id)).toEqual(['s1', 's2']);
    expect(drawn?.neverSynced).toEqual(['code·m2']);
  });

  it('is whole and empty with no Connection to read', () => {
    expect(drawnOf([], [], [], marked)).toEqual({
      key: '',
      projects: [],
      sessions: [],
      neverSynced: [],
    });
  });

  it('keeps the last whole read while Connections newly shown are read', () => {
    const last = drawnOf(
      ['m1'],
      [read('m1', 'ready', [])],
      [read('m1', 'ready', [session('m1', 's1')])],
      marked,
    );
    expect(keptOf(null, last)).toBe(last);
    expect(keptOf(null, null)).toBeNull();
    const now = drawnOf(
      ['m2'],
      [read('m2', 'ready', [])],
      [read('m2', 'ready', [])],
      marked,
    );
    expect(keptOf(now, last)).toBe(now);
  });
});

describe('the Connections the sidebar reads', () => {
  const model = {
    listRead: true,
    connections: [
      { id: 'm1', name: 'One' },
      { id: 'm2', name: 'Two' },
    ],
    problem: null,
    filterRead: true,
    chosen: null,
    collapsed: null,
    width: null,
    unseen: {},
    moving: [],
    told: null,
    refused: null,
    refusals: {},
    asking: {},
    ready: false,
  };

  it('are none until the kept list and the Connection Filter are read', () => {
    expect(readOf({ ...model, listRead: false })).toEqual([]);
    expect(readOf({ ...model, filterRead: false, chosen: 'm2' })).toEqual([]);
    expect(readOf(model)).toEqual(['m1', 'm2']);
    expect(readOf({ ...model, chosen: 'm2' })).toEqual(['m2']);
  });

  it('are one Query each, keyed by the Connection, whatever the list does around it', () => {
    // A Connection still read keeps its key, so its Query and rows stay.
    expect(across.each(['m1', 'm2'])).toEqual(['m1', 'm2']);
    expect(across.each(['m2', 'm1'])).toEqual(['m2', 'm1']);
    expect(across.each(['m2'])).toEqual(['m2']);
    expect(across.props('m2')).toEqual({ connectionId: 'm2' });
  });
});
