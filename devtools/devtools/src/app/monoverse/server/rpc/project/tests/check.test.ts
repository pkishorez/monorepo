import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkProject } from '@kestack/monoverse';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { withFixture } from '../../../tests/git-fixture.js';
import { servicesLayer } from '../../../tests/services.js';
import { openProject, readPackage } from '../real/project.js';

/*
 * Each Package checked by its own monoverse.json, as `monoverse lint`
 * checks it: `app` has one, `plain` none, `broken` one that cannot be
 * read; `app` and `plain` depend on each other, a Package cycle, which is
 * never a Violation. `app` holds one file for each way a check could go
 * wrong, and one test asks @kestack/monoverse's own `checkProject` over
 * the same files for the very same report. The last checks a branch read
 * from git as the same commit on disk.
 */

const files: Record<string, string> = {
  'package.json': '{"name":"mono","private":true}\n',
  'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
  'packages/app/package.json': JSON.stringify({
    name: 'app',
    dependencies: { plain: 'workspace:*' },
    imports: { '#other/*': './src/other/*' },
  }),
  'packages/app/tsconfig.json':
    '{\n  // A comment, as tsconfig allows.\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] } }\n}\n',
  'packages/app/monoverse.json': JSON.stringify(
    {
      sourceRoots: ['./src/'],
      ignore: ['./**/tests/**'],
      rules: {
        imports: { doors: ['./shared/'] },
        contracts: {
          folders: ['services/*/contract'],
          required: ['services/*/contract'],
        },
      },
      exceptions: [
        {
          from: 'src/host/',
          to: 'src/other/thing.ts',
          reason: 'The host wires the parts itself.',
        },
        { from: 'src/nowhere/', to: 'src/other/', reason: 'Lets nothing.' },
      ],
      restrictions: [
        { from: 'src/pure/', to: 'react', reason: 'pure code has no React.' },
        { from: 'src/gone/', to: 'react', reason: 'no such folder.' },
      ],
    },
    null,
    2,
  ),
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
  // An alias is judged as the file it names: package.json `imports`, and
  // tsconfig `paths`.
  'packages/app/src/feature/alias.ts':
    "import '#other/thing.ts';\nimport '@/other/thing.ts';\nimport '@/shared/index.ts';\n",
  // An exception lets this through.
  'packages/app/src/host/main.ts': "import '../other/thing.js';\n",
  // A restriction refuses React, by name, whatever the imports rule says.
  'packages/app/src/pure/calc.ts':
    "import { useState } from 'react';\nexport const calc = useState;\n",
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
  'packages/app/monoverse.json': 2,
  [app('feature/alias.ts')]: 2,
  [app('feature/lazy.ts')]: 1,
  [app('feature/legacy.ts')]: 2,
  [app('feature/twice.ts')]: 2,
  [app('feature/view.ts')]: 1,
  [app('main.ts')]: 1,
  [app('pure/calc.ts')]: 1,
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
      file: 'packages/broken/monoverse.json',
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
    // Each says what `monoverse lint` says, and where, naming the import
    // as it is written.
    expect(violations).toContainEqual({
      from: app('main.ts'),
      line: 1,
      column: 23,
      to: app('other/thing.ts'),
      reason: 'inside',
      message:
        "'./other/thing.js' reaches inside src/other. Import src/other through its index file, and export what you need from there.",
    });
    expect(violations).toContainEqual({
      from: app('feature/view.ts'),
      line: 1,
      column: 8,
      to: app('other/index.ts'),
      reason: 'door',
      message:
        "'../other/index.js' is beside or above this file and is not a door. Import a door's index file (shared), or move what you need into one.",
    });
    expect(violations).toContainEqual({
      from: app('services/store/real/index.ts'),
      line: 1,
      column: 1,
      reason: 'contract',
      message:
        'src/services/store has no contract/. Put its Context.Service in src/services/store/contract/index.ts.',
    });
    // A restriction says its reason.
    expect(violations).toContainEqual({
      from: app('pure/calc.ts'),
      line: 1,
      column: 26,
      reason: 'restriction',
      message: "'react' may not be imported here: pure code has no React.",
    });
    // What is wrong with the monoverse.json itself is told on it.
    expect(
      violations
        .filter(({ from }) => from === 'packages/app/monoverse.json')
        .map(({ reason }) => reason),
    ).toEqual(['unused-exception', 'stale-restriction']);
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
    expect(contents.check).toMatchObject({
      _tag: 'Invalid',
      file: 'packages/broken/monoverse.json',
    });
  });

  test("finds exactly what @kestack/monoverse's own checkProject finds", async () => {
    const workspace = await open();
    const engine = checkProject({ root, files: Object.keys(files) });
    // The engine checks only the Packages with a monoverse.json.
    const checked = workspace.packages.filter(
      ({ check }) => check._tag !== 'Unchecked',
    );
    const asEngine = checked.map(({ path, check }) => ({
      path,
      result:
        check._tag === 'Checked'
          ? {
              _tag: 'Checked',
              violations: check.violations.map(({ from, reason, ...rest }) => ({
                ...rest,
                file: from,
                kind: reason,
              })),
            }
          : check,
    }));
    expect(asEngine).toEqual(
      engine.map(({ path, result }) => ({
        path,
        result:
          result._tag === 'Checked'
            ? {
                _tag: 'Checked',
                // DevTools does not carry the import as written.
                violations: result.violations.map(
                  ({ kind, file, line, column, to, message }) => ({
                    kind,
                    file,
                    line,
                    column,
                    ...(to === undefined ? {} : { to }),
                    message,
                  }),
                ),
              }
            : result,
      })),
    );
  });

  test('a monoverse.json saved with a byte order mark reads as without one', async () => {
    await writeFile(
      join(root, 'packages/plain/monoverse.json'),
      '﻿{"sourceRoots":["src"],"preset":"default"}\n',
    );
    const contents = await read('packages/plain');
    expect(contents.check._tag).toBe('Checked');
  });
});

describe('a branch no worktree has', () => {
  test('is checked as the same commit on disk, aliases and installed tsconfigs too', () =>
    withFixture(async ({ repo, worktree, git, write }) => {
      const core = (path: string) => `packages/core/${path}`;
      // The Package's tsconfig, which holds the alias, extends one from
      // node_modules, which git never has: the copy links the checkout's
      // in, or the tsconfig could not be read.
      const installed = async (folder: string) =>
        write(
          join(folder, core('node_modules/@fixture/base/tsconfig.json')),
          '{"compilerOptions":{"strict":true}}\n',
        );
      git(repo, 'checkout', '-q', '-b', 'checked');
      const commit: Record<string, string> = {
        '.gitignore': 'node_modules\n',
        [core('monoverse.json')]:
          '{"sourceRoots":["src"],"preset":"default"}\n',
        [core('tsconfig.json')]:
          '{"extends":"@fixture/base/tsconfig.json","compilerOptions":{"paths":{"@/*":["./src/*"]}}}\n',
        [core('src/lib/index.ts')]: "export * from './deep.js';\n",
        [core('src/lib/deep.ts')]: 'export const deep = 1;\n',
        [core('src/alias.ts')]: "import '@/lib/deep.ts';\n",
        [core('src/relative.ts')]: "import './lib/deep.js';\n",
      };
      for (const [path, text] of Object.entries(commit))
        await write(join(repo, path), text);
      git(repo, 'add', '--all');
      git(repo, 'commit', '-q', '-m', 'checked');
      git(repo, 'checkout', '-q', 'main');
      await installed(repo);

      const checkAt = async () => {
        const contents = await Effect.runPromise(
          readPackage(repo, 'checked', 'packages/core').pipe(
            Effect.provide(servicesLayer),
          ),
        );
        const workspace = await Effect.runPromise(
          openProject(repo, 'checked').pipe(Effect.provide(servicesLayer)),
        );
        return {
          contents,
          check: workspace.packages.find(({ name }) => name === 'core')?.check,
        };
      };
      const fromGit = await checkAt();
      expect(fromGit.contents.check).toEqual(fromGit.check);
      expect(fromGit.check).toEqual({
        _tag: 'Checked',
        violations: [
          expect.objectContaining({
            from: core('src/alias.ts'),
            to: core('src/lib/deep.ts'),
            reason: 'inside',
          }),
          expect.objectContaining({
            from: core('src/relative.ts'),
            to: core('src/lib/deep.ts'),
            reason: 'inside',
          }),
        ],
      });
      expect(fromGit.contents.imports).toContainEqual([
        core('src/alias.ts'),
        core('src/lib/deep.ts'),
      ]);

      // The same commit checked out in a worktree is read from the disk.
      const checkout = `${worktree}-checked`;
      git(repo, 'worktree', 'add', '-q', checkout, 'checked');
      await installed(checkout);
      const onDisk = await checkAt();
      expect(onDisk).toEqual(fromGit);
    }));

  test('opened at a folder inside the repository, reads what sits above it as the disk does', () =>
    withFixture(async ({ repo, worktree, git, write }) => {
      const core = (path: string) => `packages/core/${path}`;
      git(repo, 'checkout', '-q', '-b', 'nested');
      const commit: Record<string, string> = {
        // The alias is in a tsconfig above the Project folder.
        'tsconfig.base.json':
          '{"compilerOptions":{"paths":{"@core/*":["./packages/core/src/*"]}}}\n',
        [core('tsconfig.json')]: '{"extends":"../../tsconfig.base.json"}\n',
        [core('monoverse.json')]:
          '{"sourceRoots":["src"],"preset":"default"}\n',
        [core('src/lib/index.ts')]: "export * from './deep.js';\n",
        [core('src/lib/deep.ts')]: 'export const deep = 1;\n',
        [core('src/alias.ts')]: "import '@core/lib/deep.ts';\n",
      };
      for (const [path, text] of Object.entries(commit))
        await write(join(repo, path), text);
      git(repo, 'add', '--all');
      git(repo, 'commit', '-q', '-m', 'nested');
      git(repo, 'checkout', '-q', 'main');

      const root = join(repo, 'packages/core');
      const checkAt = () =>
        Effect.runPromise(
          readPackage(root, 'nested', '.').pipe(Effect.provide(servicesLayer)),
        );
      const fromGit = await checkAt();
      expect(fromGit.check).toEqual({
        _tag: 'Checked',
        violations: [
          expect.objectContaining({
            from: 'src/alias.ts',
            to: 'src/lib/deep.ts',
            reason: 'inside',
          }),
        ],
      });

      git(repo, 'worktree', 'add', '-q', `${worktree}-nested`, 'nested');
      expect(await checkAt()).toEqual(fromGit);
    }));
});
