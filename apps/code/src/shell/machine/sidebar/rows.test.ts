import type { Project, Session } from '@kestack/ai-toolkit/api';
import { describe, expect, it } from 'vitest';
import { groupsOf, rowsOf, sessionBeside } from './rows.ts';

const project = (id: string, createdAt: number) =>
  ({ id, name: id, path: `/${id}`, createdAt }) as Project;
const session = (
  id: string,
  projectId: string,
  activeAt: number,
  settledAt: number | null = null,
) => ({ id, projectId, activeAt, settledAt }) as Session;

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
  rowsOf(groups, (id) => whole.includes(id)).map(({ place }) => place);
const beside = (
  from: { projectId: string; sessionId: string | null } | null,
  by: 1 | -1,
) => sessionBeside(groups, from, by)?.id;

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
      'p:b',
      's:b1',
      'p:c',
      'p:a',
      's:a4',
      's:a3',
      's:a2',
      'm:a',
    ]);
    expect(places(['a'])).toEqual([
      'p:b',
      's:b1',
      'p:c',
      'p:a',
      's:a4',
      's:a3',
      's:a2',
      's:a1',
      's:a5',
    ]);
  });

  it('step to the session beside, across projects, hidden ones too', () => {
    expect(beside({ projectId: 'b', sessionId: 'b1' }, 1)).toBe('a4');
    expect(beside({ projectId: 'a', sessionId: 'a4' }, -1)).toBe('b1');
    expect(beside({ projectId: 'a', sessionId: 'a2' }, 1)).toBe('a1');
    expect(beside({ projectId: 'a', sessionId: 'a5' }, 1)).toBeUndefined();
    expect(beside({ projectId: 'b', sessionId: 'b1' }, -1)).toBeUndefined();
  });

  it('start from a project as above its first session, or at either end from nowhere', () => {
    expect(beside({ projectId: 'c', sessionId: null }, 1)).toBe('a4');
    expect(beside({ projectId: 'c', sessionId: null }, -1)).toBe('b1');
    expect(beside(null, 1)).toBe('b1');
    expect(beside(null, -1)).toBe('a5');
    // A Settled session is not in the order: as from nowhere.
    expect(beside({ projectId: 'b', sessionId: 'b2' }, 1)).toBe('b1');
  });
});
