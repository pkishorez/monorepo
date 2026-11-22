import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { mainFiles, withFixture } from '../../tests/git-fixture.js';
import { openSnapshot, readText } from '../index.js';

const open = (root: string, branch: string | null) =>
  Effect.runPromise(openSnapshot(root, branch));

describe('a Project at a branch', () => {
  test('null is the folder as it is on disk', () =>
    withFixture(async ({ repo, write }) => {
      await write(join(repo, 'loose.txt'), 'loose\n');
      const snapshot = await open(repo, null);
      expect(snapshot.source).toEqual({ kind: 'disk', folder: repo });
      expect(await snapshot.list('')).toContain('loose.txt');
    }));

  test('a branch no worktree has is read from git at its last commit', () =>
    withFixture(async ({ repo, write }) => {
      // Untracked work in the folder is not the branch's.
      await write(join(repo, 'loose.txt'), 'loose\n');
      const snapshot = await open(repo, 'feature');
      expect(snapshot.source.kind).toBe('git');
      expect(await snapshot.list('')).toEqual(
        [...Object.keys(mainFiles), 'packages/core/src/feature.ts'].sort(
          (left, right) => left.localeCompare(right),
        ),
      );
      expect(await snapshot.list('packages/core/src')).toEqual([
        'packages/core/src/feature.ts',
        'packages/core/src/index.ts',
        'packages/core/src/util.ts',
      ]);
      expect(await readText(snapshot, 'README.md')).toBe(
        '# Fixture\n\nOn feature.\n',
      );
      expect(await snapshot.read('loose.txt')).toBeUndefined();
      const many = await snapshot.readMany([
        'packages/core/src/util.ts',
        'packages/core/src/feature.ts',
        'missing.ts',
      ]);
      expect([...many.keys()].sort()).toEqual([
        'packages/core/src/feature.ts',
        'packages/core/src/util.ts',
      ]);
      expect(
        new TextDecoder().decode(many.get('packages/core/src/util.ts')),
      ).toBe(mainFiles['packages/core/src/util.ts']);
    }));

  test('a branch checked out in a worktree is read from it, uncommitted work included', () =>
    withFixture(async ({ repo, worktree }) => {
      const snapshot = await open(repo, 'wip');
      expect(snapshot.source).toEqual({ kind: 'disk', folder: worktree });
      expect(snapshot.root).toBe(repo);
      expect(await snapshot.list('packages/core')).toContain(
        'packages/core/src/draft.ts',
      );
      expect(await readText(snapshot, 'README.md')).toBe(
        '# Fixture\n\nWork in progress.\n',
      );
    }));

  test("the folder's own branch is the folder itself", () =>
    withFixture(async ({ repo }) => {
      const snapshot = await open(repo, 'main');
      expect(snapshot.source).toEqual({ kind: 'disk', folder: repo });
    }));

  test('a Project inside the repository reads its own folder at the branch', () =>
    withFixture(async ({ repo, worktree }) => {
      const root = join(repo, 'packages/core');
      const fromGit = await open(root, 'feature');
      expect(await fromGit.list('')).toEqual([
        'package.json',
        'src/feature.ts',
        'src/index.ts',
        'src/util.ts',
      ]);
      expect(await readText(fromGit, 'src/feature.ts')).toContain('feature');

      const fromWorktree = await open(root, 'wip');
      expect(fromWorktree.source).toEqual({
        kind: 'disk',
        folder: join(worktree, 'packages/core'),
      });
      expect(await fromWorktree.list('src')).toContain('src/draft.ts');
    }));

  test('an unknown branch, or a folder outside git, fails as git unavailable', () =>
    withFixture(async ({ repo }) => {
      expect(
        await Effect.runPromise(openSnapshot(repo, 'nope').pipe(Effect.flip)),
      ).toMatchObject({ _tag: 'GitUnavailableError', reason: 'unknown-ref' });
      expect(
        await Effect.runPromise(
          openSnapshot(repo, '--output=x').pipe(Effect.flip),
        ),
      ).toMatchObject({ _tag: 'GitUnavailableError', reason: 'unknown-ref' });
      expect(
        await Effect.runPromise(
          openSnapshot(join(repo, 'missing'), null).pipe(Effect.flip),
        ),
      ).toMatchObject({ _tag: 'InvalidRootError', reason: 'not-found' });
    }));
});
