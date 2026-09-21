import { resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { getPackageReadme } from '../index.js';

const monorepoRoot = resolve(import.meta.dirname, 'fixtures/with-readme');

describe('getPackageReadme', () => {
  test('returns the Package README.md by default', async () => {
    const readme = await getPackageReadme(monorepoRoot, 'packages/core').pipe(
      Effect.runPromise,
    );

    expect(readme.path).toBe('README.md');
    expect(readme.markdown).toContain('# Core');
  });

  test('returns a nested markdown file with its normalized path', async () => {
    const readme = await getPackageReadme(
      monorepoRoot,
      'packages/core',
      './src/eschema/../eschema/README.md',
    ).pipe(Effect.runPromise);

    expect(readme.path).toBe('src/eschema/README.md');
    expect(readme.markdown).toContain('# eschema');
  });

  test('reports a Package without README.md as not found', async () => {
    const error = await getPackageReadme(monorepoRoot, 'packages/bare').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'PackageReadmeNotFoundError',
      path: 'README.md',
    });
  });

  test('rejects a relative path that escapes the Package folder', async () => {
    const error = await getPackageReadme(
      monorepoRoot,
      'packages/core',
      '../bare/package.json',
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({
      _tag: 'PackageReadmeOutsidePackageError',
      relativePath: '../bare/package.json',
    });
  });

  test('rejects an absolute path', async () => {
    const error = await getPackageReadme(
      monorepoRoot,
      'packages/core',
      resolve(monorepoRoot, 'packages/core/README.md'),
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({ _tag: 'PackageReadmeOutsidePackageError' });
  });

  test('reports a folder as not found', async () => {
    const error = await getPackageReadme(
      monorepoRoot,
      'packages/core',
      'src',
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({
      _tag: 'PackageReadmeNotFoundError',
      path: 'src',
    });
  });
});
