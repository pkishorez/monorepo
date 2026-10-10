import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { detectPackageManager } from '../index.js';

// Writes `files` into a fresh folder and detects its Package Manager.
async function detect(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'monoverse-package-manager-'));
  try {
    for (const [name, content] of Object.entries(files))
      await writeFile(join(root, name), content);
    return await Effect.runPromise(
      detectPackageManager(root).pipe(Effect.provide(NodeServices.layer)),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('detectPackageManager', () => {
  test('is pnpm when pnpm-workspace.yaml is present, whatever else says', async () => {
    expect(
      await detect({
        'pnpm-workspace.yaml': 'packages: []\n',
        'package.json': '{"packageManager":"yarn@4.5.0"}',
        'yarn.lock': '',
      }),
    ).toBe('pnpm');
  });

  test('follows the packageManager field over any lockfile', async () => {
    for (const name of ['pnpm', 'npm', 'yarn', 'bun'] as const) {
      expect(
        await detect({
          'package.json': `{"packageManager":"${name}@1.2.3"}`,
          'package-lock.json': '{}',
        }),
      ).toBe(name);
    }
  });

  test('ignores a packageManager field naming none of the four', async () => {
    expect(
      await detect({
        'package.json': '{"packageManager":"deno@2.0.0"}',
        'yarn.lock': '',
      }),
    ).toBe('yarn');
  });

  test('reads the lockfile when nothing is declared', async () => {
    const cases = [
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['bun.lock', 'bun'],
      ['bun.lockb', 'bun'],
      ['package-lock.json', 'npm'],
    ] as const;
    for (const [lockfile, expected] of cases) {
      expect(await detect({ 'package.json': '{}', [lockfile]: '' })).toBe(
        expected,
      );
    }
  });

  test('falls back to npm, even when package.json is missing or malformed', async () => {
    expect(await detect({ 'package.json': '{"workspaces":[]}' })).toBe('npm');
    expect(await detect({ 'package.json': '{' })).toBe('npm');
    expect(await detect({})).toBe('npm');
  });
});
