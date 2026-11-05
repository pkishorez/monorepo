import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { describe, expect, it } from 'vitest';
import { tunnelOf } from '../../../../account.ts';
import {
  health,
  outdated,
  outOfReach,
  pluginNotice,
  statusOf,
} from '../health.ts';
import { pillOf, shortOf } from '../view.tsx';

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
      ? { _tag: 'SettingUp', step: { _tag: 'Opening' } }
      : { _tag: 'Ready', url, check: { _tag: 'Reachable', at: lastSeen } },
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
      _tag: 'Ready',
      url: 'https://m.trycloudflare.com',
      check: { _tag: 'Unreachable', at: now, problem: 'no route' },
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

describe('a Connection’s tunnel, as the app says it', () => {
  const seen = (status: Connection['status']) =>
    ({ _tag: 'Seen', lastSeen: 0, status }) as const;
  const settingUp = (
    step: Extract<Connection['status'], { _tag: 'SettingUp' }>['step'],
  ) => seen({ _tag: 'SettingUp', step });
  const ready = (
    check: Extract<Connection['status'], { _tag: 'Ready' }>['check'],
  ) => seen({ _tag: 'Ready', url: 'https://m.trycloudflare.com', check });
  const FAILED = { _tag: 'Failed', at: 0, problem: 'no route' } as const;
  const BROKEN = { _tag: 'Unreachable', at: 0, problem: 'no route' } as const;

  it('says how much of cloudflared has arrived, and for how long', () => {
    const step = {
      _tag: 'Downloading',
      elapsed: 40_000,
      received: 12_400_000,
    } as const;
    const said = 'Downloading cloudflared · 12.4 MB, 40s';
    expect(statusOf(settingUp(step).status)).toBe(said);
    expect(pillOf(settingUp(step))?.[0]).toBe(said);
  });

  it('says only the time while none of it has arrived', () => {
    const step = { _tag: 'Downloading', elapsed: 40_000, received: 0 } as const;
    expect(statusOf(settingUp(step).status)).toBe(
      'Downloading cloudflared · 40s',
    );
  });

  it('says each other step and check', () => {
    expect(statusOf(settingUp({ _tag: 'Opening' }).status)).toBe(
      'Opening its tunnel',
    );
    expect(statusOf(settingUp(FAILED).status)).toBe(
      'Tunnel failed to open: no route',
    );
    expect(statusOf(ready({ _tag: 'Unchecked' }).status)).toBe(
      'Tunnel not checked yet',
    );
    expect(statusOf(ready({ _tag: 'Reachable', at: 0 }).status)).toBe(
      'Tunnel working',
    );
    expect(statusOf(ready(BROKEN).status)).toBe('Tunnel broken: no route');
  });

  it('is a socket still linking while Ready, Unchecked or Reachable', () => {
    for (const each of [
      ready({ _tag: 'Unchecked' }),
      ready({ _tag: 'Reachable', at: 0 }),
    ]) {
      expect(outOfReach(each)).toBe(false);
      expect(pillOf(each)?.[0]).toBe('Connecting…');
      expect(shortOf(each)).toBe('Connecting…');
    }
  });

  it('is out of reach when it failed to open, or its check did not reach it', () => {
    for (const each of [settingUp(FAILED), ready(BROKEN)]) {
      expect(outOfReach(each)).toBe(true);
      expect(shortOf(each)).toBe('Out of reach');
    }
    expect(pillOf(settingUp(FAILED))?.[0]).toBe('Tunnel failed · retrying');
    expect(pillOf(ready(BROKEN))?.[0]).toMatch(/^Out of reach · seen /);
  });

  it('is still on its way while it sets up, though out of reach', () => {
    const opening = settingUp({ _tag: 'Opening' });
    expect(outOfReach(opening)).toBe(true);
    expect(shortOf(opening)).toBe('Connecting…');
    expect(pillOf(opening)?.[0]).toBe('Opening tunnel…');
  });
});
