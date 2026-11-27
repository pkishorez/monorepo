import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { withFixture } from '../../../tests/git-fixture.js';
import {
  listBranches,
  listWorktrees,
  parseWorktreeList,
} from '../real/repository.js';

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
      { root: '/repo', head: 'aaa', branch: 'main', primary: true },
      { root: '/repo-wt', head: 'bbb', branch: null, primary: false },
    ]);
  });

  test('has no primary checkout when the repository is bare', () => {
    const output = [
      'worktree /repo.git',
      'bare',
      '',
      'worktree /main',
      'HEAD aaa',
      'branch refs/heads/main',
      '',
    ].join('\n');
    expect(parseWorktreeList(output)).toEqual([
      { root: '/main', head: 'aaa', branch: 'main', primary: false },
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

describe('the Worktrees of a Project', () => {
  test('are every checkout, the primary first, each by the folder the Project is in there', () =>
    withFixture(async ({ repo, worktree, git }) => {
      const root = join(worktree, 'packages/core');
      const head = git(worktree, 'rev-parse', 'HEAD').trim();
      expect(await listWorktrees(root)).toEqual([
        {
          folder: join(repo, 'packages/core'),
          branch: 'main',
          head: expect.any(String),
          primary: true,
          current: false,
        },
        { folder: root, branch: 'wip', head, primary: false, current: true },
      ]);
    }));

  test('name no branch for a detached checkout', () =>
    withFixture(async ({ repo, worktree, git }) => {
      git(worktree, 'checkout', '-q', '--detach');
      const [, detached] = await listWorktrees(repo);
      expect(detached).toMatchObject({ folder: worktree, branch: null });
    }));
});
