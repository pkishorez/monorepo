import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { describe, expect, it } from 'vitest';
import { socketUrl } from '../../../../connections.ts';
import { health, olderThan, pluginNotice, updateOf } from '../health.ts';

/*
 * What a Connection's record says of it.
 */

type Connection = typeof ConnectionSchema.Type;

const connection = (
  id: string,
  lastSeen: number,
  url: string | null = `https://${id}.trycloudflare.com`,
): Connection => ({
  id,
  name: id,
  key: `key-${id}`,
  version: '0.0.1',
  status:
    url === null
      ? { _tag: 'Opening' }
      : { _tag: 'Reachable', url, at: lastSeen },
  lastSeen,
  plugins: {},
  wanted: {},
  latestVersion: null,
});

describe('a Connection’s record', () => {
  const now = 1_000_000;

  it('says why its socket is not up', () => {
    expect(health(connection('m', now), 'linked', now, true)._tag).toBe(
      'Linked',
    );
    expect(health(null, 'linking', now, true)._tag).toBe('Unknown');
    const broken = {
      _tag: 'Unreachable',
      url: 'https://m.trycloudflare.com',
      at: now,
      problem: 'no route',
    } as const;
    expect(
      health(
        { ...connection('m', now - 10_000), status: broken },
        'relinking',
        now,
        true,
      ),
    ).toEqual({ _tag: 'Seen', lastSeen: now - 10_000, status: broken });
    expect(
      health(connection('m', now - 46_000), 'relinking', now, true)._tag,
    ).toBe('Down');
  });

  it('believes nothing of a kept record until it is checked', () => {
    const stale = connection('m', now - 18 * 60_000);
    // Kept, its socket on its way: only linking, never down.
    expect(health(stale, 'linking', now, false)._tag).toBe('Unknown');
    // Checked: Cloud Connect answered, or long enough passed.
    expect(health(stale, 'linking', now, true)._tag).toBe('Down');
    // A socket up and dropped since is news of its own.
    expect(health(stale, 'relinking', now, false)._tag).toBe('Down');
    expect(health(stale, 'linked', now, false)._tag).toBe('Linked');
  });

  it('is reached at its `https://` address over `wss`, and at no other', () => {
    expect(socketUrl('https://a-b.trycloudflare.com/')).toBe(
      'wss://a-b.trycloudflare.com/code/rpc',
    );
    expect(socketUrl('http://a-b.trycloudflare.com')).toBeNull();
    expect(socketUrl('ws://a-b.trycloudflare.com')).toBeNull();
    expect(socketUrl(null)).toBeNull();
  });
});

describe('a Connection’s code Plugin', () => {
  const now = 1_000_000;
  const hash = 'a'.repeat(64);
  const withPlugin = (
    state: Connection['plugins'][string],
    lastSeen = now,
  ) => ({
    ...connection('m', lastSeen),
    plugins: { code: state },
  });

  it('is Updating while a new version downloads, with how far, and while it starts', () => {
    expect(
      pluginNotice(
        withPlugin({ _tag: 'Downloading', hash, received: 512, total: 2048 }),
        now,
      ),
    ).toEqual({ _tag: 'Updating', progress: { received: 512, total: 2048 } });
    expect(pluginNotice(withPlugin({ _tag: 'Starting', hash }), now)).toEqual({
      _tag: 'Updating',
      progress: null,
    });
  });

  it('is Crashed with its last lines and when it is tried again', () => {
    expect(
      pluginNotice(
        withPlugin({
          _tag: 'Crashed',
          hash,
          log: ['Error: boom'],
          retryAt: now + 4_000,
        }),
        now,
      ),
    ).toEqual({ _tag: 'Crashed', log: ['Error: boom'], retryAt: now + 4_000 });
  });

  it('says nothing while it runs, before it reported, or while the Connection is down', () => {
    expect(pluginNotice(withPlugin({ _tag: 'Running', hash }), now)).toBeNull();
    expect(pluginNotice(connection('m', now), now)).toBeNull();
    expect(
      pluginNotice(withPlugin({ _tag: 'Starting', hash }, now - 60_000), now),
    ).toBeNull();
    expect(pluginNotice(null, now)).toBeNull();
  });
});

describe('a Connection’s ke-connect', () => {
  it('orders versions as semver does', () => {
    expect(olderThan('0.0.4', '0.0.5')).toBe(true);
    expect(olderThan('0.0.10', '0.0.9')).toBe(false);
    expect(olderThan('0.1.0', '0.1.0')).toBe(false);
    expect(olderThan('1.0.0-next.1', '1.0.0')).toBe(true);
    expect(olderThan('1.0.0', '0.9.9')).toBe(false);
  });

  it('asks to update only when Cloud Connect names a newer one', () => {
    const at = (version: string, latestVersion: string | null) => ({
      ...connection('m', 0),
      version,
      latestVersion,
    });
    expect(updateOf(at('0.0.4', '0.0.5'))).toBe('0.0.5');
    expect(updateOf(at('0.0.5', '0.0.5'))).toBeNull();
    expect(updateOf(at('0.0.6', '0.0.5'))).toBeNull();
    expect(updateOf(at('0.0.4', null))).toBeNull();
    expect(updateOf(null)).toBeNull();
  });
});
