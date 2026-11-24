import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { servicesLayer } from '../../../tests/services.js';
import { openProject, readPackage } from '../real/project.js';

/*
 * Each Package checked by its own monoverse.json, as `vp lint` checks it:
 * `app` has one, `plain` none, `broken` one that cannot be read; `app`
 * and `plain` depend on each other, a Package cycle, which is never a
 * Violation. `app` holds one file for each way the two could disagree,
 * and the last test runs oxlint with the plugin over the same files and
 * asks for the same count at every file.
 */

const files: Record<string, string> = {
  'package.json': '{"name":"mono","private":true}\n',
  'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
  'packages/app/package.json': JSON.stringify({
    name: 'app',
    dependencies: { plain: 'workspace:*' },
    imports: { '#other/*': './src/other/*' },
  }),
  'packages/app/monoverse.json': JSON.stringify({
    sourceRoots: ['./src/'],
    ignore: ['./**/tests/**'],
    rules: {
      imports: { doors: ['./shared/'] },
      contracts: {
        folders: ['services/*/contract'],
        required: ['services/*/contract'],
      },
    },
  }),
  'packages/app/src/index.ts': "export * from './feature/index.js';\n",
  // Reaches inside `other`, a module below it, past its index file.
  'packages/app/src/main.ts': "import { thing } from './other/thing.js';\n",
  'packages/app/src/feature/index.ts': "export * from './inner/deep.js';\n",
  'packages/app/src/feature/inner/deep.ts': 'export const deep = 1;\n',
  // `other` is beside `feature`, and not a door.
  'packages/app/src/feature/view.ts': "import '../other/index.js';\n",
  // `shared` is a door: fine.
  'packages/app/src/feature/door.ts': "import '../shared/index.js';\n",
  // An import() of a string literal is judged; of anything else, not.
  'packages/app/src/feature/lazy.ts':
    "export const a = () => import('../other/thing.js');\nexport const b = (name: string) => import(name);\n",
  // An alias is never judged, only relative imports are.
  'packages/app/src/feature/alias.ts': "import '#other/thing.ts';\n",
  // Two statements naming one file are two Violations.
  'packages/app/src/feature/twice.ts':
    "import type { thing } from '../other/thing.js';\nexport { thing as again } from '../other/thing.js';\n",
  // `.cjs` names the `.cts` beside it, `.js` the `.jsx`.
  'packages/app/src/feature/legacy.ts':
    "import '../legacy/old.cjs';\nimport '../widget/button.js';\n",
  'packages/app/src/legacy/index.ts': 'export {};\n',
  'packages/app/src/legacy/old.cts': 'export const old = 1;\n',
  'packages/app/src/widget/index.ts': 'export {};\n',
  'packages/app/src/widget/button.jsx': 'export const button = 1;\n',
  // A declaration file is never checked.
  'packages/app/src/feature/types.d.ts': "import '../other/thing.js';\n",
  // A package nested inside is its own: never judged from outside.
  'packages/app/src/feature/nest.ts': "import '../nested/src/deep.js';\n",
  'packages/app/src/nested/package.json': '{"name":"nested"}\n',
  'packages/app/src/nested/src/deep.ts': 'export const deep = 1;\n',
  // Contracts: `store` has none, and `cache`'s exports a value.
  'packages/app/src/services/store/real/index.ts': 'export const store = 1;\n',
  'packages/app/src/services/cache/contract/index.ts':
    'export const cache = 1;\nexport type Cache = number;\n',
  'packages/app/src/shared/index.ts': 'export const shared = 1;\n',
  'packages/app/src/other/index.ts': "export * from './thing.js';\n",
  'packages/app/src/other/thing.ts': 'export const thing = 1;\n',
  // Ignored, and outside the Source roots: drawn, never checked.
  'packages/app/src/tests/main.test.ts': "import '../other/thing.js';\n",
  'packages/app/scripts/seed.ts': "import '../src/other/thing.js';\n",
  'packages/plain/package.json':
    '{"name":"plain","dependencies":{"app":"workspace:*"}}\n',
  'packages/plain/src/a/index.ts': "import '../b/c.js';\n",
  'packages/plain/src/b/index.ts': 'export const b = 1;\n',
  'packages/plain/src/b/c.ts': 'export const c = 1;\n',
  'packages/broken/package.json': '{"name":"broken"}\n',
  'packages/broken/monoverse.json':
    '{"sourceRoots":["src"],"preset":"default","rules":{}}\n',
};

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'monoverse-check-'));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
});
afterEach(() => rm(root, { recursive: true, force: true }));

const open = () =>
  Effect.runPromise(
    openProject(root, null).pipe(Effect.provide(servicesLayer)),
  );
const read = (path: string) =>
  Effect.runPromise(
    readPackage(root, null, path).pipe(Effect.provide(servicesLayer)),
  );

/** How many Violations each file holds, by its path from the root. */
const countsOf = (
  violations: ReadonlyArray<{ readonly from: string }>,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const { from } of violations) counts[from] = (counts[from] ?? 0) + 1;
  return counts;
};

const app = (path: string) => `packages/app/src/${path}`;

const expected = {
  [app('feature/lazy.ts')]: 1,
  [app('feature/legacy.ts')]: 2,
  [app('feature/twice.ts')]: 2,
  [app('feature/view.ts')]: 1,
  [app('main.ts')]: 1,
  [app('services/cache/contract/index.ts')]: 1,
  [app('services/store/real/index.ts')]: 1,
};

describe("a Package's Check", () => {
  test('on opening the project: every Package checked by its own monoverse.json, or not at all', async () => {
    const workspace = await open();
    const checkOf = (name: string) =>
      workspace.packages.find((pkg) => pkg.name === name)?.check;
    const appCheck = checkOf('app');
    expect(appCheck?._tag).toBe('Checked');
    expect(
      countsOf(appCheck?._tag === 'Checked' ? appCheck.violations : []),
    ).toEqual(expected);
    expect(checkOf('plain')).toEqual({ _tag: 'Unchecked' });
    expect(checkOf('broken')).toMatchObject({
      _tag: 'Invalid',
      message: expect.stringMatching(/^monoverse\.json /),
    });
    // The cycle is there, and it is no Violation.
    expect(workspace.cycles).toEqual([{ packages: ['app', 'plain'] }]);
  });

  test("on reading a Package: its Source roots, every file's imports, and only the checked files' Violations", async () => {
    const contents = await read('packages/app');
    expect(contents.sourceRoots).toEqual(['packages/app/src']);
    // The ignored test and the script outside the Source roots are drawn…
    expect(contents.imports).toContainEqual([
      'packages/app/src/tests/main.test.ts',
      'packages/app/src/other/thing.ts',
    ]);
    expect(contents.imports).toContainEqual([
      'packages/app/scripts/seed.ts',
      'packages/app/src/other/thing.ts',
    ]);
    // …and so are an import() and an alias, which the graph follows.
    expect(contents.imports).toContainEqual([
      app('feature/lazy.ts'),
      app('other/thing.ts'),
    ]);
    expect(contents.imports).toContainEqual([
      app('feature/alias.ts'),
      app('other/thing.ts'),
    ]);
    // …and only the checked files' statements are counted.
    expect(contents.check._tag).toBe('Checked');
    const violations =
      contents.check._tag === 'Checked' ? contents.check.violations : [];
    expect(countsOf(violations)).toEqual(expected);
    // Each says what the lint says, naming the import as it is written.
    expect(violations).toContainEqual({
      from: app('main.ts'),
      to: app('other/thing.ts'),
      reason: 'inside',
      message:
        "'./other/thing.js' reaches inside src/other. Import src/other through its index file, and export what you need from there.",
    });
    expect(violations).toContainEqual({
      from: app('feature/view.ts'),
      to: app('other/index.ts'),
      reason: 'door',
      message:
        "'../other/index.js' is beside or above this file and is not a door. Import a door's index file (shared), or move what you need into one.",
    });
    expect(violations).toContainEqual({
      from: app('services/store/real/index.ts'),
      reason: 'contract',
      message:
        'src/services/store has no contract/. Put its Context.Service in src/services/store/contract/index.ts.',
    });
  });

  test('a Package without a monoverse.json is the whole Package, unchecked', async () => {
    const contents = await read('packages/plain');
    expect(contents.sourceRoots).toEqual(['packages/plain']);
    expect(contents.imports).toContainEqual([
      'packages/plain/src/a/index.ts',
      'packages/plain/src/b/c.ts',
    ]);
    expect(contents.check).toEqual({ _tag: 'Unchecked' });
  });

  test('a monoverse.json that cannot be read says why, and checks nothing', async () => {
    const contents = await read('packages/broken');
    expect(contents.sourceRoots).toEqual(['packages/broken']);
    expect(contents.check._tag).toBe('Invalid');
  });

  test('a monoverse.json saved with a byte order mark reads as without one', async () => {
    await writeFile(
      join(root, 'packages/plain/monoverse.json'),
      '﻿{"sourceRoots":["src"],"preset":"default"}\n',
    );
    const contents = await read('packages/plain');
    expect(contents.check._tag).toBe('Checked');
  });

  test('`vp lint` with the plugin finds the same, at the same files', async () => {
    const config = join(root, '.oxlintrc.json');
    await writeFile(
      config,
      JSON.stringify({
        jsPlugins: [
          fileURLToPath(import.meta.resolve('@kestack/monoverse/oxlint')),
        ],
        rules: {
          'monoverse/imports': 'error',
          'monoverse/contracts': 'error',
        },
      }),
    );
    const output = run(vp(), [
      'lint',
      '-c',
      config,
      '-A',
      'all',
      '--format',
      'json',
      join(root, 'packages/app'),
    ]);
    const { diagnostics } = JSON.parse(output) as {
      diagnostics: ReadonlyArray<{ readonly filename: string }>;
    };
    // oxlint names each file from where it runs; /tmp may be a link.
    const real = realpathSync(root);
    const linted = countsOf(
      diagnostics.map(({ filename }) => ({
        from: relative(real, realpathSync(resolve(process.cwd(), filename))),
      })),
    );
    expect(linted).toEqual(expected);
  });
});

/** Vite+'s `vp`, from the nearest node_modules above this file. */
function vp(): string {
  for (
    let at = dirname(fileURLToPath(import.meta.url));
    at !== dirname(at);
    at = dirname(at)
  ) {
    const bin = join(at, 'node_modules/.bin/vp');
    if (existsSync(bin)) return bin;
  }
  throw new Error('No node_modules/.bin/vp above this test.');
}

/** Runs a command and returns what it printed; a lint that finds something exits non-zero. */
function run(command: string, args: ReadonlyArray<string>): string {
  try {
    return execFileSync(command, args, { encoding: 'utf8' });
  } catch (error) {
    return String((error as { readonly stdout?: unknown }).stdout ?? '');
  }
}
