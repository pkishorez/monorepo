import { resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { withFixture } from '../../../tests/git-fixture.js';
import { servicesLayer } from '../../../tests/services.js';
import * as handlers from '../real/read-file.js';

// The handler, on the real services.
const readRootFile = (root: string, branch: string | null, path: string) =>
  handlers.readRootFile(root, branch, path).pipe(Effect.provide(servicesLayer));

const monorepoRoot = resolve(import.meta.dirname, 'fixtures/monorepo');

describe('reading a file on disk', () => {
  test('reads a file by its root-relative path', async () => {
    const file = await readRootFile(
      monorepoRoot,
      null,
      'packages/core/README.md',
    ).pipe(Effect.runPromise);

    expect(file.path).toBe('packages/core/README.md');
    expect(file.content).toContain('# Core');
  });

  test('normalizes the path it returns', async () => {
    const file = await readRootFile(
      monorepoRoot,
      null,
      './packages/core/src/eschema/../eschema/README.md',
    ).pipe(Effect.runPromise);

    expect(file.path).toBe('packages/core/src/eschema/README.md');
    expect(file.content).toContain('# eschema');
  });

  test('reports a missing file as not found', async () => {
    const error = await readRootFile(
      monorepoRoot,
      null,
      'packages/bare/README.md',
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({
      _tag: 'FileNotFoundError',
      path: 'packages/bare/README.md',
    });
  });

  test('rejects a path that escapes the root', async () => {
    const error = await readRootFile(monorepoRoot, null, '../outside.md').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'FileOutsideError',
      path: '../outside.md',
    });
  });

  test('rejects an absolute path', async () => {
    const error = await readRootFile(
      monorepoRoot,
      null,
      resolve(monorepoRoot, 'packages/core/README.md'),
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({ _tag: 'FileOutsideError' });
  });

  test('reports a folder as not found', async () => {
    const error = await readRootFile(
      monorepoRoot,
      null,
      'packages/core/src',
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({
      _tag: 'FileNotFoundError',
      path: 'packages/core/src',
    });
  });
});

describe('reading a file at a branch read from git', () => {
  test('reads the commit, not the folder, and the file the branch lacks is not found', () =>
    withFixture(async ({ repo }) => {
      const file = await readRootFile(repo, 'feature', 'README.md').pipe(
        Effect.runPromise,
      );
      expect(file).toEqual({
        path: 'README.md',
        content: '# Fixture\n\nOn feature.\n',
      });
      const missing = await readRootFile(
        repo,
        'main',
        'packages/core/src/feature.ts',
      ).pipe(Effect.flip, Effect.runPromise);
      expect(missing).toMatchObject({ _tag: 'FileNotFoundError' });
    }));
});
