import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { builtHash } from '../release-log/index.ts';
import { minConnect, minConnectOf } from '../index.ts';

/*
 * What a Stage tells every Connection of its Plugins: a build that is the
 * same each time, so its hash names one Release, and a Minimum Connect no
 * newer than the Connect it ships.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** The code Plugin built into a folder of its own: its hash. */
const build = () => {
  const out = mkdtempSync(join(tmpdir(), 'connect-pack-'));
  execFileSync('vp', ['pack', '--out-dir', out, '--logLevel', 'error'], {
    cwd: ROOT,
    stdio: 'pipe',
  });
  return builtHash(join(out, 'code.mjs'));
};

describe("a Stage's Plugins", () => {
  it('builds the code Plugin the same twice, so its hash is its Release', () => {
    const first = build();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(build()).toBe(first);
  }, 120_000);

  it('names the Minimum Connect package.json names, never newer than this Connect', async () => {
    expect(await Effect.runPromise(minConnect)).toMatch(/^\d+\.\d+\.\d+/);
    expect(
      await Effect.runPromise(
        minConnectOf({ version: '0.0.5', minConnect: '0.0.4' }),
      ),
    ).toBe('0.0.4');
    await expect(
      Effect.runPromise(
        minConnectOf({ version: '0.0.4', minConnect: '0.0.5' }),
      ),
    ).rejects.toThrow(/newer than this Connect/);
    await expect(
      Effect.runPromise(minConnectOf({ version: '0.0.4' })),
    ).rejects.toThrow(/no `minConnect`/);
  });
});
