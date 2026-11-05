import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { describe, expect, it } from 'vitest';
import { tunnelOf } from '../../../../account.ts';
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
  wanted: {},
  minConnect: null,
  displayName: null,
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
    // Checked: Connect Cloud answered, or long enough passed.
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
  it('is Updating while its socket says it runs an older Release', () => {
    expect(pluginNotice('Updating')).toEqual({ _tag: 'Updating' });
  });

  it('is Stale when its socket says this Code is the older side', () => {
    expect(pluginNotice('Stale')).toEqual({ _tag: 'Stale' });
  });

  it('says nothing while nobody is behind', () => {
    expect(pluginNotice(null)).toBeNull();
  });
});
