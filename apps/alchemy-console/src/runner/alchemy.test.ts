import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { compareVersions, inspect, LOCAL_STATE } from './alchemy.ts';
import { installFor } from './workspace.ts';

/*
 * Inspect on the app's own Alchemy, as a project's checkout installs it:
 * the stack's name, its providers and its state store, read without any
 * credentials and without reaching anything.
 */

const fixtures = fileURLToPath(
  new URL('../../tests/fixtures/', import.meta.url),
);

beforeAll(async () => {
  // No profile and no credentials of the machine's own.
  process.env.HOME = await mkdtemp(path.join(tmpdir(), 'runner-home-'));
  for (const name of Object.keys(process.env))
    if (name.startsWith('CLOUDFLARE_')) delete process.env[name];
});

describe('inspect', () => {
  it('reads a Cloudflare stack’s name, providers and Cloudflare state, with no credentials', async () => {
    expect(
      await inspect({
        folder: path.join(fixtures, 'cloudflare-state'),
        entrypoint: 'alchemy.run.ts',
        stage: 'inspect',
      }),
    ).toEqual({
      stackName: 'CloudflareFixture',
      stateStore: 'cloudflare',
      providers: ['cloudflare'],
      alchemyVersion: expect.stringMatching(/^2\./),
    });
  });

  it('fails a stack that keeps its state in a local file', async () => {
    await expect(
      inspect({
        folder: path.join(fixtures, 'local-state'),
        entrypoint: 'alchemy.run.ts',
        stage: 'inspect',
      }),
    ).rejects.toThrow(LOCAL_STATE);
  });
});

describe('compareVersions', () => {
  it('orders prereleases before their release, numerically', () => {
    expect(compareVersions('2.0.0-beta.79', '2.0.0-beta.80')).toBeLessThan(0);
    expect(compareVersions('2.0.0-beta.100', '2.0.0-beta.80')).toBeGreaterThan(
      0,
    );
    expect(compareVersions('2.0.0', '2.0.0-beta.80')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0-beta.80', '2.0.0-beta.80')).toBe(0);
    expect(compareVersions('1.9.9', '2.0.0-beta.80')).toBeLessThan(0);
  });
});

describe('installFor', () => {
  it('installs with the lockfile nearest the folder, up to the repository’s root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'runner-repo-'));
    const folder = path.join(root, 'apps', 'site');
    await mkdir(folder, { recursive: true });
    expect(installFor(root, folder)).toEqual({
      cwd: folder,
      command: 'npm',
      args: ['install'],
    });
    await writeFile(path.join(root, 'pnpm-lock.yaml'), '');
    expect(installFor(root, folder)).toEqual({
      cwd: root,
      command: 'pnpm',
      args: ['install', '--frozen-lockfile'],
    });
    await writeFile(path.join(folder, 'bun.lock'), '');
    expect(installFor(root, folder).command).toBe('bun');
  });
});
