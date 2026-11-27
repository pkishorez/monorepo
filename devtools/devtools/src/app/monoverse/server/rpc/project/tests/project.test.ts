import { readdirSync } from 'node:fs';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { withFixture } from '../../../tests/git-fixture.js';
import { copies, servicesLayer } from '../../../tests/services.js';
import { openProject, readPackage } from '../real/project.js';

const open = (root: string, branch: string | null) =>
  openProject(root, branch).pipe(Effect.provide(servicesLayer));
const read = (root: string, branch: string | null, path: string) =>
  readPackage(root, branch, path).pipe(Effect.provide(servicesLayer));

describe('a Project opened at a branch', () => {
  test('read from git: its Workspace, and a Package with its imports', () =>
    withFixture(async ({ repo }) => {
      const workspace = await Effect.runPromise(open(repo, 'feature'));
      expect(readdirSync(copies)).toEqual([]);
      expect(workspace).toMatchObject({
        kind: 'monorepo',
        name: 'fixture',
        path: repo,
        packageManager: 'pnpm',
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
        read(repo, 'feature', 'packages/core'),
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
        check: { _tag: 'Unchecked' },
      });
    }));

  test('in a worktree: its files on disk, untracked ones included', () =>
    withFixture(async ({ repo }) => {
      const contents = await Effect.runPromise(
        read(repo, 'wip', 'packages/core'),
      );
      expect(contents.files).toContain('packages/core/src/draft.ts');
      expect(contents.files).not.toContain('packages/core/src/feature.ts');
    }));

  test('a Package the branch lacks is not found', () =>
    withFixture(async ({ repo }) => {
      const error = await Effect.runPromise(
        read(repo, 'feature', 'packages/missing').pipe(Effect.flip),
      );
      expect(error).toMatchObject({
        _tag: 'WorkspaceReadError',
        reason: 'package-not-found',
      });
    }));

  test('a relative root is refused', async () => {
    const error = await Effect.runPromise(
      open('relative/path', null).pipe(Effect.flip),
    );
    expect(error).toMatchObject({
      _tag: 'InvalidRootError',
      reason: 'relative',
    });
  });
});
