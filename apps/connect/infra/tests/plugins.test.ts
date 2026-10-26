import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  builtCode,
  connectVersion,
  pluginsEnv,
  releaseOf,
} from '../plugins.ts';

/*
 * What a deploy ships of the code Plugin: the file named by its sha256, at
 * the path Cloud Connect serves it from, and the `PLUGINS` naming it.
 */

const ORIGIN = 'https://pr12-connect.kishore.app/';

describe('a Plugin release', () => {
  it('names the file by its sha256, at the path Cloud Connect serves it from', () => {
    const release = releaseOf('code', new TextEncoder().encode('abc'), ORIGIN);
    const hash =
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(release).toEqual({
      name: 'code',
      hash,
      key: `plugins/code/${hash}.mjs`,
      url: `https://pr12-connect.kishore.app/plugins/code/${hash}.mjs`,
    });
    expect(JSON.parse(pluginsEnv([release]))).toEqual({
      code: { hash, url: release.url },
    });
  });

  it('reads the built file and hashes it as `pnpm build:plugin` prints', () => {
    const dir = mkdtempSync(join(tmpdir(), 'connect-plugin-'));
    const file = join(dir, 'code.mjs');
    writeFileSync(file, 'export const plugin = 1;\n');
    const printed = execFileSync('shasum', ['-a', '256', file], {
      encoding: 'utf8',
    }).split(' ')[0];
    expect(builtCode(ORIGIN, file)?.hash).toBe(printed);
    expect(builtCode(ORIGIN, join(dir, 'missing.mjs'))).toBeNull();
  });

  it('tells Connections the version in package.json', () => {
    expect(connectVersion()).toMatch(/^\d+\.\d+\.\d+/);
    expect(
      fileURLToPath(new URL('../../package.json', import.meta.url)),
    ).toMatch(/apps\/connect\/package\.json$/);
  });
});
