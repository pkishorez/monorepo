import type { Project, Session } from '@kestack/ai-toolkit/api';
import { describe, expect, it } from 'vitest';
import { sessionBeside, shown, treeOf } from './rows.ts';

const project = (id: string, name: string) =>
  ({ id, name, path: `/${name}`, createdAt: 0 }) as Project;
const session = (id: string, projectId: string, createdAt: number) =>
  ({ id, projectId, createdAt }) as Session;

const rows = treeOf(
  [project('b', 'beta'), project('a', 'alpha'), project('c', 'gamma')],
  [
    session('a1', 'a', 1),
    session('a2', 'a', 2),
    session('b1', 'b', 1),
    session('c1', 'c', 1),
  ],
);
const places = (unfolded: ReadonlySet<string>) =>
  rows.filter((row) => shown(row, unfolded)).map(({ place }) => place);
const beside = (
  unfolded: ReadonlySet<string>,
  from: string | null,
  by: 1 | -1,
) => sessionBeside(rows, unfolded, from, by)?.place;

describe('the sidebar rows', () => {
  it('are projects by name, each with its sessions newest first', () => {
    expect(rows.map(({ place }) => place)).toEqual([
      'p:a',
      's:a2',
      's:a1',
      'p:b',
      's:b1',
      'p:c',
      's:c1',
    ]);
  });

  it('show only the sessions of unfolded projects', () => {
    expect(places(new Set(['b']))).toEqual(['p:a', 'p:b', 's:b1', 'p:c']);
  });

  it('step to the shown session beside, across projects', () => {
    const all = new Set(['a', 'b', 'c']);
    expect(beside(all, 's:a1', 1)).toBe('s:b1');
    expect(beside(all, 's:b1', -1)).toBe('s:a1');
    expect(beside(all, 's:c1', 1)).toBeUndefined();
    expect(beside(all, 's:a2', -1)).toBeUndefined();
  });

  it('skip the sessions of folded projects, even from one', () => {
    const some = new Set(['a', 'c']);
    expect(beside(some, 's:a1', 1)).toBe('s:c1');
    expect(beside(some, 's:b1', -1)).toBe('s:a1');
  });

  it('start at a project, or at either end from nowhere', () => {
    const all = new Set(['a', 'b', 'c']);
    expect(beside(all, 'p:b', 1)).toBe('s:b1');
    expect(beside(all, null, 1)).toBe('s:a2');
    expect(beside(all, null, -1)).toBe('s:c1');
  });
});
