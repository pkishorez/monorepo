import { describe, expect, it } from 'vitest';
import { listTree, presets } from '../index.ts';
import { importMessage, judgeImport } from '../shared/imports/index.ts';

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
  'libs/util/package.json',
  'libs/util/index.ts',
]);

const kabuki = presets.kabuki.imports!;
const judge = (from: string, to: string) =>
  judgeImport(tree, kabuki, `apps/web/src/${from}`, `apps/web/src/${to}`);

const units = listTree([
  'package.json',
  'src/feature/server/index.ts',
  'src/feature/server/mcp/tools/contract/index.ts',
  'src/feature/server/mcp/tools/real/index.ts',
  'src/feature/server/mcp/tools/tests/tools.test.ts',
  'src/feature/server/other/contract/index.ts',
  'src/feature/server/other/real/index.ts',
  'src/feature/actor-feature/index.ts',
]);
const judgeUnit = (from: string, to: string) =>
  judgeImport(units, kabuki, `src/feature/${from}`, `src/feature/${to}`);

describe('an MCP Toolkit contract, mcp/*/contract', () => {
  it('is open to its own real/ and tests/', () => {
    expect(
      judgeUnit(
        'server/mcp/tools/real/index.ts',
        'server/mcp/tools/contract/index.ts',
      ),
    ).toEqual({ ok: true });
    expect(
      judgeUnit(
        'server/mcp/tools/tests/tools.test.ts',
        'server/mcp/tools/contract/index.ts',
      ),
    ).toEqual({ ok: true });
  });

  it('is open to its server only, not to the feature outside it', () => {
    expect(
      judgeUnit('actor-feature/index.ts', 'server/mcp/tools/contract/index.ts'),
    ).toEqual({ ok: false, reason: 'door', doors: kabuki.doors });
  });

  it('opens no other folder named contract', () => {
    expect(
      judgeUnit('server/other/real/index.ts', 'server/other/contract/index.ts'),
    ).toEqual({ ok: false, reason: 'door', doors: kabuki.doors });
  });
});

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
    const outside = listTree([
      'shared/package.json',
      'shared/x/index.ts',
      'shared/y/index.ts',
      'shared/y/f.ts',
    ]);
    expect(
      judgeImport(outside, shared, 'shared/y/f.ts', 'shared/x/index.ts'),
    ).toEqual({ ok: false, reason: 'door', doors: ['shared'] });
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
      "'./feature/part.ts' reaches inside src/feature. Import src/feature through its index file, and export what you need from there.",
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
