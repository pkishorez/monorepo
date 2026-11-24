import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { openSnapshot } from '../../../tests/services.js';
import { analyzeMonorepo } from '../real/workspace/engine.js';

// The folder `root` as it is on disk, read as a Workspace.
const analyze = (root: string) =>
  Effect.flatMap(openSnapshot(root, null), (snapshot) =>
    Effect.flatMap(
      Effect.promise(() => snapshot.list('')),
      (files) => analyzeMonorepo(snapshot, files),
    ),
  );

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
    const analysis = await Effect.runPromise(analyze(fixture('basic')));
    expect(analysis.kind).toBe('monorepo');
    expect(analysis.name).toBe('basic-monorepo');
    expect(analysis.packages.map((pkg) => pkg.name)).toEqual([
      'core',
      'ui',
      'web',
    ]);
    const web = analysis.packages.find((pkg) => pkg.name === 'web')!;
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
    expect(analysis.cycles).toEqual([]);
  });

  test('rejects a folder with no package.json', () =>
    withMonorepo({ 'README.md': '# Notes' }, async (root) => {
      const error = await Effect.runPromise(analyze(root).pipe(Effect.flip));
      expect(error).toMatchObject({
        _tag: 'MonorepoReadError',
        reason: 'no-package-json',
        path: root,
      });
    }));

  test('names pnpm as the Package Manager of a pnpm Monorepo', async () => {
    const analysis = await Effect.runPromise(analyze(fixture('basic')));
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
        const analysis = await Effect.runPromise(analyze(root));
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
        const analysis = await Effect.runPromise(analyze(root));
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
        const analysis = await Effect.runPromise(analyze(root));
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
        const analysis = await Effect.runPromise(analyze(root));
        expect(analysis.packageManager).toBe('pnpm');
        expect(analysis.packages.map((pkg) => pkg.name)).toEqual(['web']);
      },
    ));

  test('skips node_modules but keeps a folder whose name only contains it', () =>
    withMonorepo(
      {
        'pnpm-workspace.yaml': 'packages:\n  - packages/**\n',
        'packages/core/package.json': '{"name":"core"}',
        'packages/core/node_modules/dep/package.json': '{"name":"dep"}',
        'packages/node_modules_tools/package.json': '{"name":"tools"}',
      },
      async (root) => {
        const analysis = await Effect.runPromise(analyze(root));
        expect(analysis.packages.map((pkg) => pkg.name)).toEqual([
          'core',
          'tools',
        ]);
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
        const analysis = await Effect.runPromise(analyze(root));
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
            analyze(root).pipe(Effect.flip),
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
      const error = await Effect.runPromise(analyze(root).pipe(Effect.flip));
      expect(error).toMatchObject({
        _tag: 'MonorepoReadError',
        reason: 'workspace-parse',
        path: join(root, 'package.json'),
      });
    }));
});

describe('a Single Package', () => {
  test('is a package.json that lists no workspace globs, its own one Package', () =>
    withMonorepo(
      {
        'package.json':
          '{"name":"solo","version":"1.2.0","dependencies":{"effect":"*"}}',
        'bun.lock': '',
        'src/index.ts': 'export {};\n',
        'packages/inner/package.json': '{"name":"inner"}',
      },
      async (root) => {
        const analysis = await Effect.runPromise(analyze(root));
        expect(analysis).toMatchObject({
          kind: 'single-package',
          name: 'solo',
          path: root,
          packageManager: 'bun',
          cycles: [],
        });
        expect(analysis.packages).toEqual([
          {
            name: 'solo',
            path: '.',
            version: '1.2.0',
            private: false,
            dependencies: [],
          },
        ]);
      },
    ));

  test('is a pnpm-workspace.yaml without packages, holding only settings', () =>
    withMonorepo(
      {
        'pnpm-workspace.yaml': 'catalog:\n  effect: 4.0.0\n',
        'package.json': '{"name":"solo"}',
        'packages/inner/package.json': '{"name":"inner"}',
      },
      async (root) => {
        const analysis = await Effect.runPromise(analyze(root));
        expect(analysis.kind).toBe('single-package');
        expect(analysis.packageManager).toBe('pnpm');
        expect(analysis.packages.map((pkg) => pkg.name)).toEqual(['solo']);
      },
    ));

  test('is named by its folder when its package.json names nothing', () =>
    withMonorepo({ 'package.json': '{"private":true}' }, async (root) => {
      const analysis = await Effect.runPromise(analyze(root));
      const folder = root.split('/').pop();
      expect(analysis.name).toBe(folder);
      expect(analysis.packages.map((pkg) => pkg.name)).toEqual([folder]);
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
    const analysis = await Effect.runPromise(analyze(root));
    expect(analysis.packages.map((pkg) => pkg.name)).toEqual(['core']);
    await writeFile(join(root, 'packages/core/src/package.json'), '{');
    const error = await Effect.runPromise(analyze(root).pipe(Effect.flip));
    expect(error).toMatchObject({
      _tag: 'ManifestError',
      reason: 'parse',
      path: join(root, 'packages/core/src/package.json'),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
