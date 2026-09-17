import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { analyzeMonorepo } from '../engine.js';

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

describe('analyzeMonorepo', () => {
  test('describes every Package the workspace globs match', async () => {
    const analysis = await Effect.runPromise(analyzeMonorepo(fixture('basic')));
    expect(analysis.name).toBe('basic-monorepo');
    expect(analysis.packages.map((pkg) => pkg.name)).toEqual([
      'core',
      'ui',
      'web',
    ]);
    const web = analysis.packages.find((pkg) => pkg.name === 'web')!;
    expect(web.group).toBe('apps');
    expect(web.path).toBe('apps/web');
    expect(web.private).toBe(true);
    expect(web.dependencies).toEqual([
      { name: 'core', kinds: ['dev'] },
      { name: 'ui', kinds: ['runtime'] },
    ]);
    const ui = analysis.packages.find((pkg) => pkg.name === 'ui')!;
    expect(ui.dependencies).toEqual([
      { name: 'core', kinds: ['peer', 'optional'] },
    ]);
    expect(
      analysis.packages.find((pkg) => pkg.name === 'core')?.hasLaymos,
    ).toBe(true);
    expect(ui.hasLaymos).toBe(false);
    expect(analysis.violations).toEqual([]);
  });

  test('rejects a relative path', async () => {
    const error = await Effect.runPromise(
      analyzeMonorepo('relative/path').pipe(Effect.flip),
    );
    expect(error._tag).toBe('InvalidMonorepoPath');
  });

  test('rejects a folder without pnpm-workspace.yaml', async () => {
    const error = await Effect.runPromise(
      analyzeMonorepo(fixture('basic/apps/web')).pipe(Effect.flip),
    );
    expect(error._tag).toBe('MonorepoReadError');
  });
});

test('recursive workspace discovery skips missing manifests but rejects malformed manifests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'monoverse-discovery-'));
  try {
    await mkdir(join(root, 'packages/core/src'), { recursive: true });
    await writeFile(
      join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/**\n',
    );
    await writeFile(
      join(root, 'packages/core/package.json'),
      '{"name":"core"}',
    );
    const analysis = await Effect.runPromise(analyzeMonorepo(root));
    expect(analysis.packages.map((pkg) => pkg.name)).toEqual(['core']);
    await writeFile(join(root, 'packages/core/src/package.json'), '{');
    const error = await Effect.runPromise(
      analyzeMonorepo(root).pipe(Effect.flip),
    );
    expect(error).toMatchObject({
      _tag: 'ManifestError',
      reason: 'parse',
      path: join(root, 'packages/core/src/package.json'),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
