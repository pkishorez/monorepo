import { describe, expect, it } from 'vitest';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import {
  type Connection,
  fromShelfKey,
  isOutdated,
  mismatchOf,
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
  pluginPath,
  PluginMismatch,
  publicOfPath,
  publicPath,
  shelfKey,
} from '../index.js';

/*
 * How every side names a Release of a Plugin: the path Code calls it at,
 * its Public Area, its file on the Shelf, and the close that says the
 * Connection runs another; and when a Connection is Outdated.
 */

const HASH = 'a'.repeat(64);

describe('a Release of a Plugin', () => {
  it('is called at `/<name>/<sha256>/<rest>`, its RPC at `rpc`, and only that path names one', () => {
    expect(pluginPath('code', HASH)).toBe(`/code/${HASH}/rpc`);
    expect(pluginOfPath(pluginPath('code', HASH))).toEqual({
      name: 'code',
      hash: HASH,
      path: '/rpc',
    });
    expect(pluginOfPath(`/files/${HASH}/ticket/a.png`)).toEqual({
      name: 'files',
      hash: HASH,
      path: '/ticket/a.png',
    });
    for (const path of [
      '/code/rpc',
      `/code/${HASH}`,
      `/code/${HASH}/`,
      `/CODE/${HASH}/rpc`,
      `/code/${'A'.repeat(64)}/rpc`,
      `//code/${HASH}/rpc`,
      '/code/public/rpc',
    ])
      expect(pluginOfPath(path)).toBeNull();
  });

  it('serves its Public Area at `/<name>/public/<rest>`, spelled exactly', () => {
    const path = publicPath('files', 'ticket/t0k3n/a%20b.png');
    expect(path).toBe('/files/public/ticket/t0k3n/a%20b.png');
    expect(publicOfPath(path)).toEqual({
      name: 'files',
      path: '/public/ticket/t0k3n/a%20b.png',
    });
    expect(publicOfPath('/files/public/x.tar.gz')).toEqual({
      name: 'files',
      path: '/public/x.tar.gz',
    });
    for (const path of [
      '/files/public',
      '/files/public/',
      '/files/public//x',
      '/files/public/x/',
      '//files/public/x',
      '/FILES/public/x',
      '/files/PUBLIC/x',
      '/files/%70ublic/x',
      '/files/public/..',
      '/files/public/x/./y',
      '/files/public/%2e%2e/rpc',
      '/files/public/%2E./rpc',
      '/files/public/x%2Frpc',
      '/files/public/x%5crpc',
      '/files/public/x\\rpc',
      '/files/public/x y',
      '/files/public/x#y',
      `/files/${HASH}/public/x`,
    ])
      expect(publicOfPath(path)).toBeNull();
  });

  it('is on the Shelf as `<name>/<sha256>.mjs`', () => {
    expect(shelfKey('code', HASH)).toBe(`code/${HASH}.mjs`);
    expect(fromShelfKey(shelfKey('code', HASH))).toEqual({
      name: 'code',
      hash: HASH,
    });
    for (const key of [`../${HASH}.mjs`, 'code/latest.mjs', `code/${HASH}`])
      expect(fromShelfKey(key)).toBeNull();
  });

  it('closes a socket for another Release with 4409 and the hash running', async () => {
    const reason = mismatchReason(HASH);
    expect(new TextEncoder().encode(reason).length).toBeLessThanOrEqual(123);
    expect(mismatchOf({ code: PLUGIN_MISMATCH, reason })).toEqual({
      running: HASH,
    });
    expect(
      mismatchOf({ code: PLUGIN_MISMATCH, reason: mismatchReason(null) }),
    ).toEqual({ running: null });
    expect(mismatchOf({ code: 4409, reason: 'not json' })).toEqual({
      running: null,
    });
    expect(mismatchOf({ code: 1000, reason })).toBeNull();
    await expectUpgradable(PluginMismatch);
  });
});

describe('the Minimum Connect', () => {
  const at = (version: string, minConnect: string | null): Connection => ({
    id: 'c1',
    name: 'laptop',
    key: 'k',
    version,
    status: { _tag: 'Opening' },
    lastSeen: 1,
    plugins: {},
    wanted: {},
    minConnect,
    displayName: null,
  });

  it('makes a Connection below it Outdated, and none when there is none', () => {
    expect(isOutdated(at('0.0.4', '0.0.5'))).toBe(true);
    expect(isOutdated(at('0.0.5', '0.0.5'))).toBe(false);
    expect(isOutdated(at('0.1.0', '0.0.5'))).toBe(false);
    expect(isOutdated(at('0.0.5-next.1', '0.0.5'))).toBe(true);
    expect(isOutdated(at('0.0.1', null))).toBe(false);
  });
});
