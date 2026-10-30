import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { describe, expect, it } from 'vitest';
import { tunnelOf } from '../../../../connections.ts';
import { health, outdated, pluginNotice } from '../health.ts';

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
  minConnect: null,
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
    // Relinking, as when the page comes back after a while hidden: still
    // only linking until checked.
    expect(health(stale, 'relinking', now, false)._tag).toBe('Unknown');
    expect(health(stale, 'relinking', now, true)._tag).toBe('Down');
    expect(health(stale, 'linked', now, false)._tag).toBe('Linked');
  });

  it('is reached at its `https://` address over `wss`, and at no other', () => {
    expect(tunnelOf('https://a-b.trycloudflare.com/')).toBe(
      'wss://a-b.trycloudflare.com',
    );
    expect(tunnelOf('http://a-b.trycloudflare.com')).toBeNull();
    expect(tunnelOf('ws://a-b.trycloudflare.com')).toBeNull();
    expect(tunnelOf(null)).toBeNull();
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

  it('is Updating while its socket says it runs an older Release, with no report needed', () => {
    const updating = { _tag: 'Updating', progress: null };
    expect(
      pluginNotice(withPlugin({ _tag: 'Running', hash }), now, 'Updating'),
    ).toEqual(updating);
    expect(pluginNotice(null, now, 'Updating')).toEqual(updating);
    // What its report says of the download is said instead.
    expect(
      pluginNotice(
        withPlugin({ _tag: 'Downloading', hash, received: 1, total: 2 }),
        now,
        'Updating',
      ),
    ).toEqual({ _tag: 'Updating', progress: { received: 1, total: 2 } });
  });

  it('is Stale when its socket says this Code is the older side', () => {
    expect(
      pluginNotice(withPlugin({ _tag: 'Running', hash }), now, 'Stale'),
    ).toEqual({ _tag: 'Stale' });
  });
});

describe('a Connection’s ke-connect', () => {
  it('is Outdated only below the Minimum Connect Cloud Connect names', () => {
    const at = (version: string, minConnect: string | null) => ({
      ...connection('m', 0),
      version,
      minConnect,
    });
    expect(outdated(at('0.0.4', '0.0.5'))).toBe(true);
    expect(outdated(at('0.0.5', '0.0.5'))).toBe(false);
    expect(outdated(at('0.0.6', '0.0.5'))).toBe(false);
    expect(outdated(at('0.0.4', null))).toBe(false);
    expect(outdated(null)).toBe(false);
  });
});
