import { describe, expect, it } from 'vitest';
import { across } from '../../../../../machine/records/index.ts';
import { readOf } from '../../../actor.ts';
import { drawnOf, keptOf, type Read } from '../drawn.ts';

/*
 * What the sidebar draws, and when: nothing until the list kept here and
 * the Machine Filter are read; then nothing of the Machines shown until
 * each one's Projects, Sessions and Unseen marks are read, then all at
 * once; while Machines newly shown are read, the last whole read stays;
 * and each Machine is read by a Query of its own, so a change to the list
 * or the Filter never starts over a Machine still shown.
 */

const project = (machineId: string, id: string) => ({ id, machineId });
const session = (machineId: string, id: string) => ({ id, machineId });

const read = <Row>(
  machineId: string,
  status: 'loading' | 'ready',
  rows: ReadonlyArray<Row>,
  neverSynced: ReadonlyArray<string> = [],
): Read<Row> => ({
  props: { machineId },
  model: { status, rows: rows.map((row) => ({ row })), neverSynced },
});

const marked = () => true;

describe('the sidebar’s read', () => {
  it('is nothing while any Machine shown is still read', () => {
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

  it('waits for each Machine’s Unseen marks, so no row turns bold after', () => {
    const projects = [read('m1', 'ready', [])];
    const sessions = [read('m1', 'ready', [session('m1', 's1')])];
    expect(drawnOf(['m1'], projects, sessions, () => false)).toBeNull();
    expect(drawnOf(['m1'], projects, sessions, marked)).not.toBeNull();
  });

  it('draws every Machine shown at once, in order, under one key', () => {
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

  it('is whole and empty with no Machine to read', () => {
    expect(drawnOf([], [], [], marked)).toEqual({
      key: '',
      projects: [],
      sessions: [],
      neverSynced: [],
    });
  });

  it('keeps the last whole read while Machines newly shown are read', () => {
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

describe('the Machines the sidebar reads', () => {
  const model = {
    listRead: true,
    machines: [
      { id: 'm1', name: 'One' },
      { id: 'm2', name: 'Two' },
    ],
    problem: null,
    filterRead: true,
    chosen: null,
    width: null,
    unseen: {},
    moving: [],
    told: null,
    refused: null,
    refusals: {},
    ready: false,
  };

  it('are none until the kept list and the Machine Filter are read', () => {
    expect(readOf({ ...model, listRead: false })).toEqual([]);
    expect(readOf({ ...model, filterRead: false, chosen: 'm2' })).toEqual([]);
    expect(readOf(model)).toEqual(['m1', 'm2']);
    expect(readOf({ ...model, chosen: 'm2' })).toEqual(['m2']);
  });

  it('are one Query each, keyed by the Machine, whatever the list does around it', () => {
    // A Machine still read keeps its key, so its Query and rows stay.
    expect(across.each(['m1', 'm2'])).toEqual(['m1', 'm2']);
    expect(across.each(['m2', 'm1'])).toEqual(['m2', 'm1']);
    expect(across.each(['m2'])).toEqual(['m2']);
    expect(across.props('m2')).toEqual({ machineId: 'm2' });
  });
});
