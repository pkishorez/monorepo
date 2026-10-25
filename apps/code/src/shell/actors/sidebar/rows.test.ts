import type { Project, Session } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import type { OnMachine } from '../../machines/index.ts';
import { groupsOf, rowsOf, sessionBeside } from './rows.ts';

const project = (id: string, createdAt: number, machineId = 'm1') =>
  ({
    id,
    name: id,
    path: `/${id}`,
    createdAt,
    machineId,
  }) as OnMachine<Project>;
const session = (
  id: string,
  projectId: string,
  activeAt: number,
  settledAt: number | null = null,
  machineId = 'm1',
) => ({ id, projectId, activeAt, settledAt, machineId }) as OnMachine<Session>;

const groups = groupsOf(
  [project('a', 1), project('b', 2), project('c', 50)],
  [
    session('a1', 'a', 10),
    session('a2', 'a', 20),
    session('a3', 'a', 30),
    session('a4', 'a', 40),
    session('a5', 'a', 5),
    session('b1', 'b', 15),
    // Settled: out of the list, though it counts toward b's activity.
    session('b2', 'b', 60, 61),
  ],
);
const places = (whole: ReadonlyArray<string>) =>
  rowsOf(groups, (key) => whole.includes(key)).map(({ place }) => place);
const beside = (
  from: { projectId: string; sessionId: string | null } | null,
  by: 1 | -1,
) => sessionBeside(groups, from && { machineId: 'm1', ...from }, by)?.id;

describe('the sidebar rows', () => {
  it('are projects by last activity, each with its unsettled sessions by activity', () => {
    expect(groups.map(({ project }) => project.id)).toEqual(['b', 'c', 'a']);
    expect(groups.map(({ sessions }) => sessions.map(({ id }) => id))).toEqual([
      ['b1'],
      [],
      ['a4', 'a3', 'a2', 'a1', 'a5'],
    ]);
  });

  it('show three sessions of a project not shown whole, then +N', () => {
    expect(places([])).toEqual([
      'p:m1/b',
      's:m1/b1',
      'p:m1/c',
      'p:m1/a',
      's:m1/a4',
      's:m1/a3',
      's:m1/a2',
      'm:m1/a',
    ]);
    expect(places(['m1/a'])).toEqual([
      'p:m1/b',
      's:m1/b1',
      'p:m1/c',
      'p:m1/a',
      's:m1/a4',
      's:m1/a3',
      's:m1/a2',
      's:m1/a1',
      's:m1/a5',
    ]);
  });

  it('step to the session beside, across projects, hidden ones too', () => {
    expect(beside({ projectId: 'b', sessionId: 'b1' }, 1)).toBe('a4');
    expect(beside({ projectId: 'a', sessionId: 'a4' }, -1)).toBe('b1');
    expect(beside({ projectId: 'a', sessionId: 'a2' }, 1)).toBe('a1');
  });

  it('go round past either end, to the first from the last and the last from the first', () => {
    expect(beside({ projectId: 'a', sessionId: 'a5' }, 1)).toBe('b1');
    expect(beside({ projectId: 'b', sessionId: 'b1' }, -1)).toBe('a5');
    const one = groupsOf([project('a', 1)], [session('s', 'a', 10, null)]);
    expect(
      sessionBeside(
        one,
        { machineId: 'm1', projectId: 'a', sessionId: 's' },
        1,
      ),
    ).toBeUndefined();
  });

  it('start from a project as above its first session, or at either end from nowhere', () => {
    expect(beside({ projectId: 'c', sessionId: null }, 1)).toBe('a4');
    expect(beside({ projectId: 'c', sessionId: null }, -1)).toBe('b1');
    expect(beside(null, 1)).toBe('b1');
    expect(beside(null, -1)).toBe('a5');
    // A Settled session is not in the order: as from nowhere.
    expect(beside({ projectId: 'b', sessionId: 'b2' }, 1)).toBe('b1');
  });

  it('keep the same ids of two Machines apart', () => {
    const two = groupsOf(
      [project('a', 1, 'm1'), project('a', 2, 'm2')],
      [session('s', 'a', 10, null, 'm1'), session('s', 'a', 20, null, 'm2')],
    );
    expect(rowsOf(two, () => false).map(({ place }) => place)).toEqual([
      'p:m2/a',
      's:m2/s',
      'p:m1/a',
      's:m1/s',
    ]);
  });
});
