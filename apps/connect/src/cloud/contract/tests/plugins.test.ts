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
  shelfKey,
} from '../index.js';

/*
 * How every side names a Release of a Plugin: the path Code calls it at,
 * its file on the Shelf, and the close that says the Connection runs
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
  });

  it('makes a Connection below it Outdated, and none when there is none', () => {
    expect(isOutdated(at('0.0.4', '0.0.5'))).toBe(true);
    expect(isOutdated(at('0.0.5', '0.0.5'))).toBe(false);
    expect(isOutdated(at('0.1.0', '0.0.5'))).toBe(false);
    expect(isOutdated(at('0.0.5-next.1', '0.0.5'))).toBe(true);
    expect(isOutdated(at('0.0.1', null))).toBe(false);
  });
});
