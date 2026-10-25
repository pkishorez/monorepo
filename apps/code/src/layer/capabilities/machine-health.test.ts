import type { Machine as MachineSchema } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import { health, socketUrl } from './machine-health.ts';

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
    expect(health(machine('m', now), 'connected', now)._tag).toBe('Connected');
    expect(health(null, 'connecting', now)._tag).toBe('Unknown');
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
      ),
    ).toEqual({ _tag: 'Seen', lastSeen: now - 10_000, status: broken });
    expect(health(machine('m', now - 46_000), 'reconnecting', now)._tag).toBe(
      'Down',
    );
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
