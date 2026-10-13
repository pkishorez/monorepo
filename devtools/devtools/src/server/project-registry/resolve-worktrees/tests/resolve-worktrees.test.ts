import { resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { parseWorktreeList, resolveWorktrees } from '../index.js';

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

describe('resolveWorktrees', () => {
  test('resolves this package inside its repository', async () => {
    const result = await Effect.runPromise(resolveWorktrees(process.cwd()));
    expect(result).not.toBeNull();
    expect(result!.repositoryPath).toBe('devtools/devtools');
    expect(result!.current).not.toBeNull();
    const current = result!.worktrees.find((w) => w.root === result!.current);
    expect(current?.present).toBe(true);
    expect(current?.siblingPath).toBe(resolve(process.cwd()));
  });

  test('walks up when the folder is missing', async () => {
    const missing = resolve(process.cwd(), 'does-not-exist/nested');
    const result = await Effect.runPromise(resolveWorktrees(missing));
    expect(result).not.toBeNull();
    expect(result!.repositoryPath).toBe(
      'devtools/devtools/does-not-exist/nested',
    );
    expect(result!.worktrees.every((w) => w.present === false)).toBe(true);
  });

  test('returns null outside git and for relative paths', async () => {
    expect(await Effect.runPromise(resolveWorktrees('relative'))).toBeNull();
    expect(await Effect.runPromise(resolveWorktrees('/'))).toBeNull();
  });
});
