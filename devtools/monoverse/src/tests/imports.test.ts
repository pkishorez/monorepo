import { describe, expect, it } from 'vitest';
import {
  checkImport,
  importMessage,
  judgeImport,
  listTree,
  parseConfig,
  presets,
} from '../index.ts';

/*
 * The imports rule over a list of files relative to a repository root,
 * as the DevTools read a branch: two packages, one of them nested in a
 * folder, and paths that never touch the disk.
 */

const tree = listTree([
  'package.json',
  'apps/web/package.json',
  'apps/web/src/start.ts',
  'apps/web/src/feature/index.ts',
  'apps/web/src/feature/part.ts',
  'apps/web/src/feature/logic/shared/index.ts',
  'apps/web/src/feature/logic/shared/shape.ts',
  'apps/web/src/feature/view/index.ts',
  'apps/web/src/feature/view/body.ts',
  'apps/web/src/feature/view/helper.ts',
  'apps/web/src/other/index.ts',
  'apps/web/src/tests/start.test.ts',
  'libs/util/package.json',
  'libs/util/index.ts',
]);

const kabuki = presets.kabuki.imports!;
const judge = (from: string, to: string) =>
  judgeImport(tree, kabuki, `apps/web/src/${from}`, `apps/web/src/${to}`);

describe('judgeImport', () => {
  it('lets a file import any file in its own module', () => {
    expect(judge('feature/index.ts', 'feature/part.ts')).toEqual({ ok: true });
  });

  it('lets a file import the index file of a module below it', () => {
    expect(judge('start.ts', 'feature/index.ts')).toEqual({ ok: true });
    expect(judge('feature/index.ts', 'feature/view/index.ts')).toEqual({
      ok: true,
    });
  });

  it('refuses a file inside a module below, naming the module', () => {
    expect(judge('feature/index.ts', 'feature/logic/shared/shape.ts')).toEqual({
      ok: false,
      reason: 'inside',
      module: 'apps/web/src/feature/logic/shared',
    });
  });

  it('lets a file import a door above it', () => {
    expect(
      judge('feature/view/body.ts', 'feature/logic/shared/index.ts'),
    ).toEqual({ ok: true });
  });

  it('refuses a module beside it that is not a door', () => {
    expect(judge('feature/index.ts', 'other/index.ts')).toEqual({
      ok: false,
      reason: 'door',
      doors: kabuki.doors,
    });
  });

  it('never judges a file in another package', () => {
    expect(
      judgeImport(tree, kabuki, 'apps/web/src/start.ts', 'libs/util/index.ts'),
    ).toEqual({ ok: true });
  });
});

describe('checkImport', () => {
  const read = (json: unknown) => {
    const result = parseConfig(JSON.stringify(json));
    if (!result.ok) throw new Error(result.error);
    return result.config;
  };
  const config = read({
    sourceRoots: ['src'],
    ignore: ['**/tests/**'],
    preset: 'kabuki',
  });
  const wrong = [
    'apps/web/src/start.ts',
    'apps/web/src/feature/part.ts',
  ] as const;

  it('judges a file the package checks', () => {
    expect(checkImport(tree, config, ...wrong).ok).toBe(false);
  });

  it('passes a file the package ignores', () => {
    expect(
      checkImport(
        tree,
        config,
        'apps/web/src/tests/start.test.ts',
        'apps/web/src/feature/part.ts',
      ),
    ).toEqual({ ok: true });
  });

  it('passes everything when the package turns the rule off', () => {
    const off = read({ sourceRoots: ['src'], rules: {} });
    expect(checkImport(tree, off, ...wrong)).toEqual({ ok: true });
  });
});

describe('what judgeImport never judges', () => {
  const nested = listTree([
    'pkg/package.json',
    'pkg/src/a/index.ts',
    'pkg/src/a/f.ts',
    'pkg/src/inner/package.json',
    'pkg/src/inner/src/deep.ts',
  ]);
  const shared = { doors: ['shared'] };

  it('lets a file import a package nested inside its own', () => {
    expect(
      judgeImport(
        nested,
        shared,
        'pkg/src/a/f.ts',
        'pkg/src/inner/src/deep.ts',
      ),
    ).toEqual({ ok: true });
  });

  it('never takes a door owned by a folder above the package', () => {
    // The repository itself sits in a folder named `shared`.
    const outside = listTree([
      'shared/package.json',
      'shared/x/index.ts',
      'shared/y/index.ts',
      'shared/y/f.ts',
    ]);
    expect(
      judgeImport(outside, shared, 'shared/y/f.ts', 'shared/x/index.ts'),
    ).toEqual({ ok: false, reason: 'door', doors: ['shared'] });
    // A package named `shared` has no door at its root either.
    const named = listTree([
      'packages/shared/package.json',
      'packages/shared/x/index.ts',
      'packages/shared/y/index.ts',
      'packages/shared/y/f.ts',
    ]);
    expect(
      judgeImport(
        named,
        shared,
        'packages/shared/y/f.ts',
        'packages/shared/x/index.ts',
      ),
    ).toEqual({ ok: false, reason: 'door', doors: ['shared'] });
  });
});

describe('importMessage', () => {
  it('names the module to import from the package', () => {
    expect(
      importMessage(
        { ok: false, reason: 'inside', module: 'apps/web/src/feature' },
        './feature/part.ts',
        'apps/web',
      ),
    ).toBe(
      "'./feature/part.ts' reaches inside src/feature. Import src/feature/index.ts, and export what you need from there.",
    );
  });

  it('names the doors to use instead', () => {
    expect(
      importMessage(
        { ok: false, reason: 'door', doors: ['shared'] },
        'src/other/index.ts',
        'apps/web',
      ),
    ).toBe(
      "'src/other/index.ts' is beside or above this file and is not a door. Import a door's index file (shared), or move what you need into one.",
    );
  });
});
