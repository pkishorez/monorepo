import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { openProject, readPackage } from '../handlers.js';
import { withFixture } from './git-fixture.js';

describe('a Project opened at a branch', () => {
  test('read from git: its Workspace, and a Package with its imports', () =>
    withFixture(async ({ repo }) => {
      const workspace = await Effect.runPromise(openProject(repo, 'feature'));
      expect(workspace).toMatchObject({
        kind: 'monorepo',
        name: 'fixture',
        path: repo,
        packageManager: 'pnpm',
        // Every file, those inside its Packages too.
        files: [
          'package.json',
          'packages/core/package.json',
          'packages/core/src/feature.ts',
          'packages/core/src/index.ts',
          'packages/core/src/util.ts',
          'pnpm-workspace.yaml',
          'README.md',
        ],
      });
      expect(workspace.packages.map(({ name, path }) => [name, path])).toEqual([
        ['core', 'packages/core'],
      ]);

      const contents = await Effect.runPromise(
        readPackage(repo, 'feature', 'packages/core'),
      );
      expect(contents).toEqual({
        path: 'packages/core',
        files: [
          'packages/core/package.json',
          'packages/core/src/feature.ts',
          'packages/core/src/index.ts',
          'packages/core/src/util.ts',
        ],
        sourceRoots: ['packages/core'],
        imports: [
          ['packages/core/src/feature.ts', 'packages/core/src/util.ts'],
          ['packages/core/src/index.ts', 'packages/core/src/feature.ts'],
          ['packages/core/src/index.ts', 'packages/core/src/util.ts'],
        ],
      });
    }));

  test('in a worktree: its files on disk, untracked ones included', () =>
    withFixture(async ({ repo }) => {
      const contents = await Effect.runPromise(
        readPackage(repo, 'wip', 'packages/core'),
      );
      expect(contents.files).toContain('packages/core/src/draft.ts');
      expect(contents.files).not.toContain('packages/core/src/feature.ts');
    }));

  test('a Package the branch lacks is not found', () =>
    withFixture(async ({ repo }) => {
      const error = await Effect.runPromise(
        readPackage(repo, 'feature', 'packages/missing').pipe(Effect.flip),
      );
      expect(error).toMatchObject({
        _tag: 'WorkspaceReadError',
        reason: 'package-not-found',
      });
    }));

  test('a relative root is refused', async () => {
    const error = await Effect.runPromise(
      openProject('relative/path', null).pipe(Effect.flip),
    );
    expect(error).toMatchObject({
      _tag: 'InvalidRootError',
      reason: 'relative',
    });
  });
});
