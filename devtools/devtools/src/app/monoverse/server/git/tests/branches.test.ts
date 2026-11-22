import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { withFixture } from '../../tests/git-fixture.js';
import { listBranches, parseWorktreeList } from '../index.js';

describe('parseWorktreeList', () => {
  test('reads branch, detached, and bare checkouts', () => {
    const output = [
      'worktree /repo',
      'HEAD aaa',
      'branch refs/heads/main',
      '',
      'worktree /repo-wt',
      'HEAD bbb',
      'detached',
      '',
      'worktree /repo.git',
      'bare',
      '',
    ].join('\n');
    expect(parseWorktreeList(output)).toEqual([
      { root: '/repo', head: 'aaa', branch: 'main' },
      { root: '/repo-wt', head: 'bbb', branch: null },
    ]);
  });
});

describe('the branches of a Project', () => {
  test('are the local branches, the current first, each with the worktree folder it is read from', () =>
    withFixture(async ({ repo, worktree, git }) => {
      git(repo, 'branch', 'develop');
      expect(await listBranches(repo)).toEqual({
        current: 'main',
        defaultBase: 'main',
        branches: [
          { name: 'main', worktree: repo },
          { name: 'develop', worktree: null },
          { name: 'feature', worktree: null },
          { name: 'wip', worktree },
        ],
      });
    }));

  test('of a folder inside the repository name that folder in each worktree', () =>
    withFixture(async ({ repo, worktree }) => {
      const root = join(repo, 'packages/core');
      const branches = await listBranches(root);
      expect(branches.branches).toEqual([
        { name: 'main', worktree: root },
        { name: 'feature', worktree: null },
        { name: 'wip', worktree: join(worktree, 'packages/core') },
      ]);
    }));

  test('start Compare-to at main, else master, else develop, else the current one', () =>
    withFixture(async ({ worktree, git }) => {
      git(worktree, 'branch', '-m', 'main', 'trunk');
      expect((await listBranches(worktree)).defaultBase).toBe('wip');
      git(worktree, 'branch', 'develop', 'trunk');
      expect((await listBranches(worktree)).defaultBase).toBe('develop');
      git(worktree, 'branch', 'master', 'trunk');
      expect((await listBranches(worktree)).defaultBase).toBe('master');
    }));

  test('of a detached folder have no current one', () =>
    withFixture(async ({ worktree, git }) => {
      git(worktree, 'checkout', '-q', '--detach');
      const branches = await listBranches(worktree);
      expect(branches.current).toBeNull();
      expect(branches.branches.map(({ name }) => name)).toEqual([
        'feature',
        'main',
        'wip',
      ]);
    }));
});
