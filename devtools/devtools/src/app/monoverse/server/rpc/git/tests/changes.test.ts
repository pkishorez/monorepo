import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { withFixture } from '../../../tests/git-fixture.js';
import { servicesLayer } from '../../../tests/services.js';
import * as handlers from '../real/changes.js';

// The handlers, on the real services.
const getBranches = (root: string) =>
  handlers.getBranches(root).pipe(Effect.provide(servicesLayer));
const getChanges = (root: string, branch: string | null, base: string) =>
  handlers.getChanges(root, branch, base).pipe(Effect.provide(servicesLayer));
const getFileDiff = (
  root: string,
  branch: string | null,
  base: string,
  path: string,
) =>
  handlers
    .getFileDiff(root, branch, base, path)
    .pipe(Effect.provide(servicesLayer));

const changes = (root: string, branch: string | null, base: string) =>
  Effect.runPromise(getChanges(root, branch, base));

describe('what a branch changed since it left another', () => {
  test('read from git: from the merge-base to its last commit', () =>
    withFixture(async ({ repo, git }) => {
      const set = await changes(repo, 'feature', 'main');
      expect(set.baseRef).toBe(git(repo, 'rev-parse', 'main').trim());
      expect(set.files).toEqual([
        { path: 'packages/core/src/feature.ts', status: 'added' },
        { path: 'packages/core/src/index.ts', status: 'modified' },
        { path: 'README.md', status: 'modified' },
      ]);
    }));

  test('read from git, only what changed since the merge-base, not what main did after', () =>
    withFixture(async ({ repo, git, write }) => {
      await write(join(repo, 'later.ts'), 'export {};\n');
      git(repo, 'add', '--all');
      git(repo, 'commit', '-q', '-m', 'later on main');
      const set = await changes(repo, 'feature', 'main');
      expect(set.files.map(({ path }) => path)).not.toContain('later.ts');
    }));

  test('in a worktree: committed and uncommitted work, untracked files included', () =>
    withFixture(async ({ repo, worktree, git, write }) => {
      await write(join(worktree, 'committed.ts'), 'export {};\n');
      git(worktree, 'add', 'committed.ts');
      git(worktree, 'commit', '-q', '-m', 'wip');
      await unlink(join(worktree, 'packages/core/src/util.ts'));
      const set = await changes(repo, 'wip', 'main');
      expect(set.files).toEqual([
        { path: 'committed.ts', status: 'added' },
        { path: 'packages/core/src/draft.ts', status: 'added' },
        { path: 'packages/core/src/util.ts', status: 'deleted' },
        { path: 'README.md', status: 'modified' },
      ]);
    }));

  test('null is the folder itself, against a branch read from git', () =>
    withFixture(async ({ repo, write }) => {
      await write(join(repo, 'loose.ts'), 'export {};\n');
      const set = await changes(repo, null, 'feature');
      expect(set.files).toEqual([{ path: 'loose.ts', status: 'added' }]);
    }));

  test('of a Project inside the repository, relative to its folder', () =>
    withFixture(async ({ repo }) => {
      const root = join(repo, 'packages/core');
      expect((await changes(root, 'feature', 'main')).files).toEqual([
        { path: 'src/feature.ts', status: 'added' },
        { path: 'src/index.ts', status: 'modified' },
      ]);
      expect((await changes(root, 'wip', 'main')).files).toEqual([
        { path: 'src/draft.ts', status: 'added' },
      ]);
    }));

  test('an unknown base or branch fails as unknown-ref', () =>
    withFixture(async ({ repo }) => {
      for (const [branch, base] of [
        ['feature', 'nope'],
        ['nope', 'main'],
        ['feature', '--all'],
      ] as const) {
        expect(
          await Effect.runPromise(
            getChanges(repo, branch, base).pipe(Effect.flip),
          ),
        ).toMatchObject({ _tag: 'GitUnavailableError', reason: 'unknown-ref' });
      }
    }));

  test('a folder outside git says so', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'monoverse-nogit-'));
    try {
      const error = await Effect.runPromise(
        getChanges(dir, null, 'main').pipe(Effect.flip),
      );
      expect(error).toMatchObject({
        _tag: 'GitUnavailableError',
        reason: 'not-a-repo',
      });
      expect(
        await Effect.runPromise(getBranches(dir).pipe(Effect.flip)),
      ).toMatchObject({ _tag: 'GitUnavailableError', reason: 'not-a-repo' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('how one file changed', () => {
  test('read from git: the whole file, before and after', () =>
    withFixture(async ({ repo }) => {
      const diff = await Effect.runPromise(
        getFileDiff(repo, 'feature', 'main', 'README.md'),
      );
      expect(diff.path).toBe('README.md');
      expect(diff.hunks[0]?.lines).toEqual([
        { kind: 'context', content: '# Fixture', oldNumber: 1, newNumber: 1 },
        { kind: 'added', content: '', newNumber: 2 },
        { kind: 'added', content: 'On feature.', newNumber: 3 },
      ]);
    }));

  test('in a worktree: uncommitted edits, and an untracked file all added', () =>
    withFixture(async ({ repo }) => {
      const edited = await Effect.runPromise(
        getFileDiff(repo, 'wip', 'main', 'README.md'),
      );
      expect(edited.hunks[0]?.lines.at(-1)).toEqual({
        kind: 'added',
        content: 'Work in progress.',
        newNumber: 3,
      });
      const fresh = await Effect.runPromise(
        getFileDiff(repo, 'wip', 'main', 'packages/core/src/draft.ts'),
      );
      expect(fresh.hunks[0]?.lines).toEqual([
        { kind: 'added', content: 'export {};', newNumber: 1 },
      ]);
    }));

  test('never reads outside the Project folder', () =>
    withFixture(async ({ repo }) => {
      expect(
        await Effect.runPromise(
          getFileDiff(
            join(repo, 'packages/core'),
            'feature',
            'main',
            '../../README.md',
          ).pipe(Effect.flip),
        ),
      ).toMatchObject({ _tag: 'GitUnavailableError' });
    }));
});
