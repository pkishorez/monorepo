import { describe, expect, it } from 'vitest';
import {
  KEY_EXPIRED,
  keyExpired,
  keyProtocols,
  mismatchOf,
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
  pluginPath,
} from '../contract/index.js';

const HASH = 'a'.repeat(64);

describe('the Link', () => {
  it('reads a Plugin and its Release from the path, with or without a trailing slash', () => {
    expect(pluginOfPath(pluginPath('code', HASH))).toEqual({
      name: 'code',
      hash: HASH,
    });
    expect(pluginOfPath(`/code/${HASH}/rpc/`)).toEqual({
      name: 'code',
      hash: HASH,
    });
  });

  it('reads no other path', () => {
    for (const path of [
      `/code/${HASH}`,
      `/code/${HASH}/rpc/more`,
      `/Code/${HASH}/rpc`,
      `/code/${'a'.repeat(63)}/rpc`,
      `//code/${HASH}/rpc`,
      '/health',
    ])
      expect(pluginOfPath(path)).toBeNull();
  });

  it('carries the key as a subprotocol beside ke-connect', () => {
    expect(keyProtocols('k')).toEqual(['ke-connect', 'key.k']);
  });

  it('tells a mismatch and an expired key apart by how a socket closed', () => {
    expect(
      mismatchOf({ code: PLUGIN_MISMATCH, reason: mismatchReason(HASH) }),
    ).toMatchObject({
      running: HASH,
    });
    expect(mismatchOf({ code: PLUGIN_MISMATCH, reason: 'garbled' })).toEqual({
      running: null,
    });
    expect(mismatchOf({ code: 1000, reason: '' })).toBeNull();
    expect(keyExpired({ code: KEY_EXPIRED })).toBe(true);
  });

  it('keeps a mismatch reason short enough for a close frame', () => {
    expect(Buffer.byteLength(mismatchReason(HASH))).toBeLessThanOrEqual(123);
  });
});
