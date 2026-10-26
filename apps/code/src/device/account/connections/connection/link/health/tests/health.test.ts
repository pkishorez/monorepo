import type { Connection as ConnectionSchema } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import { socketUrl } from '../../../../connections.ts';
import { health } from '../health.ts';

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
