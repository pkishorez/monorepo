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

// Writes `files` (root-relative path to content) into a fresh folder, hands
// it to `use`, and removes it afterwards.
async function withMonorepo<T>(
  files: Record<string, string>,
  use: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'monoverse-workspaces-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), content);
    }
    return await use(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

  test('gives the Stories badge to a Laymos Config naming a Stories path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'monoverse-stories-'));
    try {
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*\n',
      );
      for (const [name, config] of [
        ['told', '{"sourceRoots":["src"],"storiesPath":"stories"}'],
        ['plain', '{"sourceRoots":["src"]}'],
        ['bare', undefined],
      ] as const) {
        await mkdir(join(root, 'packages', name), { recursive: true });
        await writeFile(
          join(root, 'packages', name, 'package.json'),
          `{"name":"${name}"}`,
        );
        if (config !== undefined)
          await writeFile(
            join(root, 'packages', name, 'laymos.config.json'),
            config,
          );
      }
      const analysis = await Effect.runPromise(analyzeMonorepo(root));
      expect(
        analysis.packages.map(({ name, hasLaymos, hasStories }) => ({
          name,
          hasLaymos,
          hasStories,
        })),
      ).toEqual([
        { name: 'bare', hasLaymos: false, hasStories: false },
        { name: 'plain', hasLaymos: true, hasStories: false },
        { name: 'told', hasLaymos: true, hasStories: true },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects a relative path', async () => {
    const error = await Effect.runPromise(
      analyzeMonorepo('relative/path').pipe(Effect.flip),
    );
    expect(error._tag).toBe('InvalidMonorepoPath');
  });

  test('rejects a folder with neither pnpm-workspace.yaml nor workspaces', async () => {
    const error = await Effect.runPromise(
      analyzeMonorepo(fixture('basic/apps/web')).pipe(Effect.flip),
    );
    expect(error).toMatchObject({
      _tag: 'MonorepoReadError',
      reason: 'not-a-monorepo',
      path: fixture('basic/apps/web'),
    });
  });

  test('names pnpm as the Package Manager of a pnpm Monorepo', async () => {
    const analysis = await Effect.runPromise(analyzeMonorepo(fixture('basic')));
    expect(analysis.packageManager).toBe('pnpm');
  });
});

describe('the workspaces field', () => {
  test('lists Packages as an array, the npm way', () =>
    withMonorepo(
      {
        'package.json': '{"name":"npm-monorepo","workspaces":["packages/*"]}',
        'package-lock.json': '{}',
        'packages/core/package.json': '{"name":"core"}',
        'packages/ui/package.json': '{"name":"ui","dependencies":{"core":"*"}}',
      },
      async (root) => {
        const analysis = await Effect.runPromise(analyzeMonorepo(root));
        expect(analysis.name).toBe('npm-monorepo');
        expect(analysis.packageManager).toBe('npm');
        expect(analysis.packages.map((pkg) => pkg.name)).toEqual([
          'core',
          'ui',
        ]);
        expect(
          analysis.packages.find((pkg) => pkg.name === 'ui')?.dependencies,
        ).toEqual([{ name: 'core', kinds: ['runtime'] }]);
      },
    ));

  test('lists Packages as an object, the yarn way, ignoring nohoist', () =>
    withMonorepo(
      {
        'package.json':
          '{"workspaces":{"packages":["apps/*"],"nohoist":["**/react"]}}',
        'yarn.lock': '',
        'apps/web/package.json': '{"name":"web"}',
      },
      async (root) => {
        const analysis = await Effect.runPromise(analyzeMonorepo(root));
        expect(analysis.packageManager).toBe('yarn');
        expect(analysis.packages.map((pkg) => pkg.name)).toEqual(['web']);
      },
    ));

  test('makes a Monorepo with no Packages when it lists none', () =>
    withMonorepo(
      {
        'package.json': '{"workspaces":[]}',
        'packages/core/package.json': '{"name":"core"}',
      },
      async (root) => {
        const analysis = await Effect.runPromise(analyzeMonorepo(root));
        expect(analysis.packages).toEqual([]);
      },
    ));

  test('gives way to pnpm-workspace.yaml when both are present', () =>
    withMonorepo(
      {
        'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
        'package.json': '{"workspaces":["packages/*"]}',
        'apps/web/package.json': '{"name":"web"}',
        'packages/core/package.json': '{"name":"core"}',
      },
      async (root) => {
        const analysis = await Effect.runPromise(analyzeMonorepo(root));
        expect(analysis.packageManager).toBe('pnpm');
        expect(analysis.packages.map((pkg) => pkg.name)).toEqual(['web']);
      },
    ));

  test('honours negated globs', () =>
    withMonorepo(
      {
        'package.json': '{"workspaces":["packages/*","!packages/legacy"]}',
        'packages/core/package.json': '{"name":"core"}',
        'packages/legacy/package.json': '{"name":"legacy"}',
      },
      async (root) => {
        const analysis = await Effect.runPromise(analyzeMonorepo(root));
        expect(analysis.packages.map((pkg) => pkg.name)).toEqual(['core']);
      },
    ));

  test('rejects a workspaces field of any other shape as unreadable', async () => {
    for (const workspaces of [
      '"packages/*"',
      '{"nohoist":[]}',
      '[1]',
      'null',
    ]) {
      await withMonorepo(
        { 'package.json': `{"workspaces":${workspaces}}` },
        async (root) => {
          const error = await Effect.runPromise(
            analyzeMonorepo(root).pipe(Effect.flip),
          );
          expect(error).toMatchObject({
            _tag: 'MonorepoReadError',
            reason: 'workspace-parse',
            path: join(root, 'package.json'),
          });
        },
      );
    }
  });

  test('rejects a malformed root package.json as unreadable', () =>
    withMonorepo({ 'package.json': '{' }, async (root) => {
      const error = await Effect.runPromise(
        analyzeMonorepo(root).pipe(Effect.flip),
      );
      expect(error).toMatchObject({
        _tag: 'MonorepoReadError',
        reason: 'workspace-parse',
        path: join(root, 'package.json'),
      });
    }));
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
