import { describe, expect, it } from 'vitest';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import {
  type Connection,
  fromReleaseKey,
  isOutdated,
  KEY_EXPIRED,
  keyExpired,
  mismatchOf,
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
  pluginPath,
  PluginMismatch,
  releaseKey,
} from '../index.js';

/*
 * How every side names a Release of a Plugin: the path Code calls it at,
 * its Release File, and the close that says the Connection runs
 * another; and when a Connection is Outdated.
 */

const HASH = 'a'.repeat(64);

describe('a Release of a Plugin', () => {
  it('is called at `/<name>/<sha256>/rpc`, and only that path names one', () => {
    expect(pluginPath('code', HASH)).toBe(`/code/${HASH}/rpc`);
    expect(pluginOfPath(pluginPath('code', HASH))).toEqual({
      name: 'code',
      hash: HASH,
    });
    for (const path of [
      '/code/rpc',
      `/code/${HASH}/rpc/`,
      `/CODE/${HASH}/rpc`,
      `/code/${'A'.repeat(64)}/rpc`,
      `//code/${HASH}/rpc`,
    ])
      expect(pluginOfPath(path)).toBeNull();
  });

  it('keeps its file as `<name>/<sha256>.mjs`', () => {
    expect(releaseKey('code', HASH)).toBe(`code/${HASH}.mjs`);
    expect(fromReleaseKey(releaseKey('code', HASH))).toEqual({
      name: 'code',
      hash: HASH,
    });
    for (const key of [`../${HASH}.mjs`, 'code/latest.mjs', `code/${HASH}`])
      expect(fromReleaseKey(key)).toBeNull();
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

describe('a key the Connection does not hold', () => {
  it('closes a socket with 4401, whatever the reason says', () => {
    expect(KEY_EXPIRED).toBe(4401);
    expect(keyExpired({ code: KEY_EXPIRED, reason: 'key expired' })).toBe(true);
    expect(keyExpired({ code: KEY_EXPIRED, reason: '' })).toBe(true);
  });

  it('is told from any other close', () => {
    for (const code of [1000, 1006, PLUGIN_MISMATCH])
      expect(keyExpired({ code, reason: 'key expired' })).toBe(false);
  });
});

describe('the Minimum Connect', () => {
  const at = (version: string, minConnect: string | null): Connection => ({
    id: 'c1',
    name: 'laptop',
    key: 'k',
    version,
    status: { _tag: 'SettingUp', step: { _tag: 'Opening' } },
    lastSeen: 1,
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
