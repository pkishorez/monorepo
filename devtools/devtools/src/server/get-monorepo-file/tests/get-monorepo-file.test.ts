import { resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { getMonorepoFile } from '../index.js';

const monorepoRoot = resolve(import.meta.dirname, 'fixtures/monorepo');

describe('getMonorepoFile', () => {
  test('reads a file by its Monorepo-relative path', async () => {
    const file = await getMonorepoFile(
      monorepoRoot,
      'packages/core/README.md',
    ).pipe(Effect.runPromise);

    expect(file.path).toBe('packages/core/README.md');
    expect(file.content).toContain('# Core');
  });

  test('normalizes the path it returns', async () => {
    const file = await getMonorepoFile(
      monorepoRoot,
      './packages/core/src/eschema/../eschema/README.md',
    ).pipe(Effect.runPromise);

    expect(file.path).toBe('packages/core/src/eschema/README.md');
    expect(file.content).toContain('# eschema');
  });

  test('reports a missing file as not found', async () => {
    const error = await getMonorepoFile(
      monorepoRoot,
      'packages/bare/README.md',
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({
      _tag: 'MonorepoFileNotFoundError',
      path: 'packages/bare/README.md',
    });
  });

  test('rejects a path that escapes the Monorepo', async () => {
    const error = await getMonorepoFile(monorepoRoot, '../outside.md').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'MonorepoFileOutsideError',
      path: '../outside.md',
    });
  });

  test('rejects an absolute path', async () => {
    const error = await getMonorepoFile(
      monorepoRoot,
      resolve(monorepoRoot, 'packages/core/README.md'),
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({ _tag: 'MonorepoFileOutsideError' });
  });

  test('reports a folder as not found', async () => {
    const error = await getMonorepoFile(monorepoRoot, 'packages/core/src').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'MonorepoFileNotFoundError',
      path: 'packages/core/src',
    });
  });
});
