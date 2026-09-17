import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { analyzeMonorepo } from '../index.js';

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
