import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { analyzeMonorepo } from '../index.js';

describe('analyzeMonorepo', () => {
  test('rejects a relative Monorepo path', async () => {
    const error = await analyzeMonorepo('../..').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'InvalidMonorepoPathError',
      reason: 'relative',
    });
  });

  test('reports a folder with no package.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'monoverse-rpc-'));
    try {
      const error = await analyzeMonorepo(root).pipe(
        Effect.flip,
        Effect.runPromise,
      );

      expect(error).toMatchObject({ _tag: 'NoPackageJsonError', path: root });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('returns a Single Package for a package that lists no workspace globs', async () => {
    const analysis = await analyzeMonorepo(process.cwd()).pipe(
      Effect.runPromise,
    );

    expect(analysis.kind).toBe('single-package');
    expect(analysis.packages).toMatchObject([
      { name: '@kstackz/devtools', path: '.', hasLaymos: true },
    ]);
  });

  test('names the file whose workspace globs could not be read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'monoverse-rpc-'));
    try {
      await writeFile(join(root, 'package.json'), '{"workspaces":"*"}');
      const error = await analyzeMonorepo(root).pipe(
        Effect.flip,
        Effect.runPromise,
      );

      expect(error).toMatchObject({
        _tag: 'MonorepoReadFailure',
        reason: 'workspace-parse',
        path: join(root, 'package.json'),
        message: 'Could not read the workspace globs from package.json.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('returns a Monorepo analysis for the repository root', async () => {
    const analysis = await analyzeMonorepo(
      resolve(process.cwd(), '../..'),
    ).pipe(Effect.runPromise);

    expect(analysis.kind).toBe('monorepo');
    expect(analysis.packageManager).toBe('pnpm');
    expect(analysis.packages.length).toBeGreaterThan(0);
    expect(
      analysis.packages.some((pkg) => pkg.name === '@kstackz/devtools'),
    ).toBe(true);
  });
});
