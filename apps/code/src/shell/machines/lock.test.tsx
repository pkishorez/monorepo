// @vitest-environment jsdom
import type { Machine as MachineSchema } from '@kestack/connect/code';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection, LOCK_GRACE, useLock } from './connection.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * Whether a Machine's settings are locked, and whether that is said: a
 * Line still connecting as the page opens is locked but not said so until
 * a few seconds pass; one out of reach is said so at once; connected, not
 * locked at all.
 */

type Machine = typeof MachineSchema.Type;
type Status = 'connecting' | 'connected' | 'reconnecting';

const machine = (status: Machine['status']): Machine => ({
  id: 'm1',
  name: 'm1',
  key: 'key-m1',
  version: '0.0.1',
  status,
  lastSeen: Date.now(),
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

const render = (status: Status, record: Machine) =>
  act(() =>
    root.render(
      <Connection value={{ machines: [record], status: { m1: status } }}>
        <Probe />
      </Connection>,
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

describe("a Machine's settings, locked", () => {
  it('are not said to be locked while the Line first connects, only once it takes long', () => {
    render('connecting', machine(REACHABLE));
    expect(seen).toEqual({ locked: true, said: false });
    act(() => vi.advanceTimersByTime(LOCK_GRACE - 100));
    expect(seen.said).toBe(false);
    act(() => vi.advanceTimersByTime(200));
    expect(seen).toEqual({ locked: true, said: true });
  });

  it('are said to be locked at once when the Machine is out of reach', () => {
    render(
      'reconnecting',
      machine({ ...REACHABLE, _tag: 'Unreachable', problem: 'no route' }),
    );
    expect(seen).toEqual({ locked: true, said: true });
  });

  it('are not locked once the Line is connected, and wait again when it drops', () => {
    render('connecting', machine(REACHABLE));
    render('connected', machine(REACHABLE));
    expect(seen).toEqual({ locked: false, said: false });
    act(() => vi.advanceTimersByTime(LOCK_GRACE * 2));
    render('reconnecting', machine(REACHABLE));
    expect(seen).toEqual({ locked: true, said: false });
  });
});
