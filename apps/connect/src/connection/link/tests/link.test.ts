import { describe, expect, it } from 'vitest';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import {
  KEY_EXPIRED,
  keyExpired,
  mismatchOf,
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
  pluginPath,
  PluginMismatch,
} from '../index.js';

/*
 * How an App reaches a Release of a Plugin through a Connection: the path it
 * calls it at, and the closes that say the Connection runs another, or that
 * the key offered expired.
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
