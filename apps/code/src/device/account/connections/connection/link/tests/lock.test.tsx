// @vitest-environment jsdom
import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Links, LOCK_GRACE, useLock } from '../link.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * Whether a Connection's settings are locked, and whether that is said: a
 * Link still linking as the page opens is locked but not said so until
 * a few seconds pass; one out of reach is said so at once; linked, not
 * locked at all.
 */

type Connection = typeof ConnectionSchema.Type;
type Status = 'linking' | 'linked' | 'relinking';

const connection = (status: Connection['status']): Connection => ({
  id: 'm1',
  name: 'm1',
  key: 'key-m1',
  version: '0.0.1',
  status,
  lastSeen: Date.now(),
  plugins: {},
  wanted: {},
  latestVersion: null,
});

const REACHABLE = {
  _tag: 'Reachable',
  url: 'https://m1.trycloudflare.com',
  at: 0,
} as const;

let host: HTMLDivElement;
let root: Root;
let seen: { locked: boolean; said: boolean };

function Probe() {
  const { locked, said } = useLock('m1');
  seen = { locked, said };
  return null;
}

const render = (status: Status, record: Connection) =>
  act(() =>
    root.render(
      <Links
        value={{ connections: [record], status: { m1: status }, checked: true }}
      >
        <Probe />
      </Links>,
    ),
  );

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("a Connection's settings, locked", () => {
  it('are not said to be locked while the Link first comes up, only once it takes long', () => {
    render('linking', connection(REACHABLE));
    expect(seen).toEqual({ locked: true, said: false });
    act(() => vi.advanceTimersByTime(LOCK_GRACE - 100));
    expect(seen.said).toBe(false);
    act(() => vi.advanceTimersByTime(200));
    expect(seen).toEqual({ locked: true, said: true });
  });

  it('are said to be locked at once when the Connection is out of reach', () => {
    render(
      'relinking',
      connection({ ...REACHABLE, _tag: 'Unreachable', problem: 'no route' }),
    );
    expect(seen).toEqual({ locked: true, said: true });
  });

  it('are not locked once the Link is up, and wait again when it drops', () => {
    render('linking', connection(REACHABLE));
    render('linked', connection(REACHABLE));
    expect(seen).toEqual({ locked: false, said: false });
    act(() => vi.advanceTimersByTime(LOCK_GRACE * 2));
    render('relinking', connection(REACHABLE));
    expect(seen).toEqual({ locked: true, said: false });
  });
});
