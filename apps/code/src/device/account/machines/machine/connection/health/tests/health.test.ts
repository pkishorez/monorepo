import type { Machine as MachineSchema } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import { socketUrl } from '../../../../machines.ts';
import { health } from '../health.ts';

/*
 * What a Machine's record says of it.
 */

type Machine = typeof MachineSchema.Type;

const machine = (
  id: string,
  lastSeen: number,
  url: string | null = `https://${id}.trycloudflare.com`,
): Machine => ({
  id,
  name: id,
  key: `key-${id}`,
  version: '0.0.1',
  status:
    url === null
      ? { _tag: 'Opening' }
      : { _tag: 'Reachable', url, at: lastSeen },
  lastSeen,
});

describe('a Machine’s record', () => {
  const now = 1_000_000;

  it('says why its socket is not up', () => {
    expect(health(machine('m', now), 'connected', now, true)._tag).toBe(
      'Connected',
    );
    expect(health(null, 'connecting', now, true)._tag).toBe('Unknown');
    const broken = {
      _tag: 'Unreachable',
      url: 'https://m.trycloudflare.com',
      at: now,
      problem: 'no route',
    } as const;
    expect(
      health(
        { ...machine('m', now - 10_000), status: broken },
        'reconnecting',
        now,
        true,
      ),
    ).toEqual({ _tag: 'Seen', lastSeen: now - 10_000, status: broken });
    expect(
      health(machine('m', now - 46_000), 'reconnecting', now, true)._tag,
    ).toBe('Down');
  });

  it('believes nothing of a kept record until it is checked', () => {
    const stale = machine('m', now - 18 * 60_000);
    // Kept, its socket on its way: only connecting, never down.
    expect(health(stale, 'connecting', now, false)._tag).toBe('Unknown');
    // Checked: Cloud Connect answered, or long enough passed.
    expect(health(stale, 'connecting', now, true)._tag).toBe('Down');
    // A socket up and dropped since is news of its own.
    expect(health(stale, 'reconnecting', now, false)._tag).toBe('Down');
    expect(health(stale, 'connected', now, false)._tag).toBe('Connected');
  });

  it('is reached at its `https://` address over `wss`, and at no other', () => {
    expect(socketUrl('https://a-b.trycloudflare.com/')).toBe(
      'wss://a-b.trycloudflare.com/rpc',
    );
    expect(socketUrl('http://a-b.trycloudflare.com')).toBeNull();
    expect(socketUrl('ws://a-b.trycloudflare.com')).toBeNull();
    expect(socketUrl(null)).toBeNull();
  });
});
