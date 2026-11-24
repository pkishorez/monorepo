import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { servicesLayer } from '../../../tests/services.js';
import { openProject, readPackage } from '../real/project.js';

/*
 * Each Package checked by its own monoverse.json, as `vp lint` checks it:
 * `app` has one, `plain` none, `broken` one that cannot be read; `app`
 * and `plain` depend on each other, a Package cycle, which is never a
 * Violation.
 */

const files: Record<string, string> = {
  'package.json': '{"name":"mono","private":true}\n',
  'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
  'packages/app/package.json':
    '{"name":"app","dependencies":{"plain":"workspace:*"}}\n',
  'packages/app/monoverse.json': JSON.stringify({
    sourceRoots: ['src'],
    ignore: ['**/tests/**'],
    rules: { imports: { doors: ['shared'] } },
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

const appViolations = [
  {
    from: 'packages/app/src/feature/view.ts',
    to: 'packages/app/src/other/index.ts',
    reason: 'door',
    message:
      "'src/other/index.ts' is beside or above this file and is not a door. Import a door's index file (shared), or move what you need into one.",
  },
  {
    from: 'packages/app/src/main.ts',
    to: 'packages/app/src/other/thing.ts',
    reason: 'inside',
    message:
      "'src/other/thing.ts' reaches inside src/other. Import src/other/index.ts, and export what you need from there.",
  },
];

describe("a Package's Check", () => {
  test('on opening the project: every Package checked by its own monoverse.json, or not at all', async () => {
    const workspace = await open();
    const checkOf = (name: string) =>
      workspace.packages.find((pkg) => pkg.name === name)?.check;
    expect(checkOf('app')).toEqual({
      _tag: 'Checked',
      violations: appViolations,
    });
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
    // …and never counted.
    expect(contents.check).toEqual({
      _tag: 'Checked',
      violations: appViolations,
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
});
