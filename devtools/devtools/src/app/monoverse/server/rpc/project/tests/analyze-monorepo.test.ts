import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { openSnapshot } from '../../../tests/services.js';
import { analyzeMonorepo } from '../real/workspace/analyze-monorepo.js';

// The folder `root` as it is on disk, read as a Workspace.
const analyze = (root: string) =>
  Effect.flatMap(openSnapshot(root, null), (snapshot) =>
    Effect.flatMap(
      Effect.promise(() => snapshot.list('')),
      (files) => analyzeMonorepo(snapshot, files),
    ),
  );

describe('analyzeMonorepo', () => {
  test('reports a folder with no package.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'monoverse-rpc-'));
    try {
      const error = await analyze(root).pipe(Effect.flip, Effect.runPromise);

      expect(error).toMatchObject({ _tag: 'NoPackageJsonError', path: root });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('returns a Single Package for a package that lists no workspace globs', async () => {
    const analysis = await analyze(process.cwd()).pipe(Effect.runPromise);

    expect(analysis.kind).toBe('single-package');
    expect(analysis.packages).toMatchObject([
      { name: '@kestack/devtools', path: '.' },
    ]);
  });

  test('names the file whose workspace globs could not be read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'monoverse-rpc-'));
    try {
      await writeFile(join(root, 'package.json'), '{"workspaces":"*"}');
      const error = await analyze(root).pipe(Effect.flip, Effect.runPromise);

      expect(error).toMatchObject({
        _tag: 'WorkspaceReadError',
        reason: 'workspace-parse',
        path: join(root, 'package.json'),
        message: 'Could not read the workspace globs from package.json.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('returns a Monorepo analysis for the repository root', async () => {
    const analysis = await analyze(resolve(process.cwd(), '../..')).pipe(
      Effect.runPromise,
    );

    expect(analysis.kind).toBe('monorepo');
    expect(analysis.packageManager).toBe('pnpm');
    expect(analysis.packages.length).toBeGreaterThan(0);
    expect(
      analysis.packages.some((pkg) => pkg.name === '@kestack/devtools'),
    ).toBe(true);
  });
});
