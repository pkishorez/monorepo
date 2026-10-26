import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { connectionName } from '../auth.js';
import { prefixOf, slugsOf } from '../branch.js';
import { goneOf, removeGone } from '../gone.js';

/*
 * The development Connections of branches with no checkout any more: each
 * branch is named as Portless names it, and only a `dev-` Connection that
 * is no branch's goes, through `ke-connect remove`.
 */

const porcelain = [
  'worktree /repo',
  'HEAD 1111',
  'branch refs/heads/feat/main-work',
  '',
  'worktree /repo/.claude/worktrees/connect-plugins',
  'HEAD 2222',
  'branch refs/heads/feat/connect-plugins',
  '',
  'worktree /elsewhere/detached',
  'HEAD 3333',
  'detached',
  '',
  'worktree /repo/.claude/worktrees/deleted',
  'HEAD 4444',
  'branch refs/heads/fix/Deleted_Branch',
  'prunable gitdir file points to non-existent location',
  '',
  'worktree /repo/.claude/worktrees/moved',
  'HEAD 5555',
  'branch refs/heads/moved',
  '',
].join('\n');

describe('the branches with a checkout', () => {
  it('are named as Portless names a worktree', () => {
    expect(prefixOf('feat/connect-plugins')).toBe('connect-plugins');
    expect(prefixOf('fix/Deleted_Branch')).toBe('deleted-branch');
    expect(prefixOf('main')).toBe('main');
    expect(prefixOf(null)).toBe('main');
    const long = `feat/${'a'.repeat(70)}`;
    expect(prefixOf(long)).toMatch(/^a{56}-[0-9a-f]{6}$/);
  });

  it('are every checkout still there, the first being main', () => {
    expect([...slugsOf(porcelain, (path) => !path.endsWith('/moved'))]).toEqual(
      ['main', 'connect-plugins'],
    );
  });
});

describe('a gone development Connection', () => {
  const slugs = new Set(['main', 'connect-plugins']);

  it('is a dev- Connection that is no branch’s, signed in either way', () => {
    expect(
      goneOf(
        [
          'main',
          'work',
          connectionName('main', 'fake'),
          connectionName('connect-plugins', 'real'),
          'dev-deleted-branch',
          'dev-deleted-branch-real',
        ],
        slugs,
      ),
    ).toEqual(['dev-deleted-branch', 'dev-deleted-branch-real']);
  });

  it('is removed, and none is when the branches cannot be listed', async () => {
    const asked: Array<string> = [];
    const remove = (name: string) =>
      Effect.sync(() => {
        asked.push(name);
        return name !== 'dev-stuck';
      });
    const names = () => ['dev-main', 'dev-gone', 'dev-stuck', 'main'];
    expect(
      await Effect.runPromise(
        removeGone({ slugs: Effect.succeed(slugs), names, remove }),
      ),
    ).toEqual(['dev-gone']);
    expect(asked).toEqual(['dev-gone', 'dev-stuck']);

    asked.length = 0;
    expect(
      await Effect.runPromise(
        removeGone({
          slugs: Effect.fail(new Error('not a git repository')),
          names,
          remove,
        }),
      ),
    ).toEqual([]);
    expect(asked).toEqual([]);
  });
});
