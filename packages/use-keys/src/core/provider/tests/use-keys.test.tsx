// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Key, KeysProvider, useKeys } from '../../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const key = (
  type: string,
  init: KeyboardEventInit,
  target: Element = document.body,
) =>
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }),
    );
  });

let host: HTMLDivElement;
let root: Root;
let now = 0;

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

type Seen = { keys: ReadonlyArray<Key>; interrupted?: boolean };

const watch = (enabled = true) => {
  const seen: { start: number; ends: Seen[]; last: ReadonlyArray<Key> } = {
    start: 0,
    ends: [],
    last: [],
  };
  function Watcher() {
    const { keys } = useKeys({
      enabled,
      onStart: () => seen.start++,
      onKey: (_, all) => (seen.last = all),
      onEnd: (all, { interrupted }) =>
        seen.ends.push({ keys: all, interrupted }),
    });
    return <span>{keys.map((k) => k.name).join(',')}</span>;
  }
  act(() =>
    root.render(
      <KeysProvider>
        <Watcher />
        <input />
      </KeysProvider>,
    ),
  );
  return seen;
};

describe('useKeys', () => {
  it('reports every Key from the first down to the last lifting', () => {
    const seen = watch();
    key('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true });
    now = 10;
    key('keydown', { key: 'A', code: 'KeyA', shiftKey: true });
    now = 20;
    key('keyup', { key: 'A', code: 'KeyA', shiftKey: true });
    now = 30;
    key('keydown', { key: 'A', code: 'KeyA', shiftKey: true });
    expect(host.textContent).toBe('Shift,a,a');
    now = 40;
    key('keyup', { key: 'A', code: 'KeyA', shiftKey: true });
    key('keyup', { key: 'Shift', code: 'ShiftLeft' });
    expect(host.textContent).toBe('');
    expect(seen.start).toBe(1);
    expect(seen.ends).toEqual([
      {
        interrupted: false,
        keys: [
          { code: 'ShiftLeft', name: 'Shift', downAt: 0, upAt: 40 },
          { code: 'KeyA', name: 'a', downAt: 10, upAt: 20 },
          { code: 'KeyA', name: 'a', downAt: 30, upAt: 40 },
        ],
      },
    ]);
  });

  it('never reports the browser repeating a held key', () => {
    watch();
    key('keydown', { key: 'j', code: 'KeyJ' });
    key('keydown', { key: 'j', code: 'KeyJ', repeat: true });
    expect(host.textContent).toBe('j');
  });

  it('on Apple platforms, lifts the keys pressed after Cmd when it lifts', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    watch();
    key('keydown', { key: ' ', code: 'Space' });
    key('keydown', { key: 'Meta', code: 'MetaLeft', metaKey: true });
    key('keydown', { key: 'k', code: 'KeyK', metaKey: true });
    key('keyup', { key: 'Meta', code: 'MetaLeft' });
    expect(host.textContent).toBe('Space,Meta,k');
    key('keyup', { key: ' ', code: 'Space' });
    expect(host.textContent).toBe('');
  });

  it('lifts a modifier the browser says is no longer down', () => {
    watch();
    key('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true });
    key('keydown', { key: 'j', code: 'KeyJ' });
    expect(host.textContent).toBe('j');
  });

  it('ends Interrupted when the page loses focus', () => {
    const seen = watch();
    key('keydown', { key: 'j', code: 'KeyJ' });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(seen.ends[0]?.interrupted).toBe(true);
    expect(host.textContent).toBe('');
  });

  it('hears no typing in Text Entry, but always the modifiers', () => {
    watch();
    const input = host.querySelector('input') as HTMLInputElement;
    key('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true }, input);
    key('keydown', { key: 'J', code: 'KeyJ', shiftKey: true }, input);
    expect(host.textContent).toBe('Shift');
  });

  it('hears nothing while not Enabled', () => {
    const seen = watch(false);
    key('keydown', { key: 'j', code: 'KeyJ' });
    key('keyup', { key: 'j', code: 'KeyJ' });
    expect(seen.start).toBe(0);
  });
});

describe('useKeys and data-keys="enabled"', () => {
  it('does not hear typing in Text Entry marked enabled', () => {
    function Watcher() {
      const { keys } = useKeys();
      return <span>{keys.map((k) => k.name).join(',')}</span>;
    }
    act(() =>
      root.render(
        <KeysProvider>
          <Watcher />
          <input data-keys="enabled" />
        </KeysProvider>,
      ),
    );
    key(
      'keydown',
      { key: 'h', code: 'KeyH' },
      host.querySelector('input') as Element,
    );
    expect(host.textContent).toBe('');
  });

  it('lifts every key when the provider is turned off', () => {
    const ends: boolean[] = [];
    function Watcher() {
      useKeys({ onEnd: (_, { interrupted }) => ends.push(interrupted) });
      return null;
    }
    const view = (enabled: boolean) =>
      act(() =>
        root.render(
          <KeysProvider enabled={enabled}>
            <Watcher />
          </KeysProvider>,
        ),
      );
    view(true);
    key('keydown', { key: 'j', code: 'KeyJ' });
    view(false);
    expect(ends).toEqual([true]);
  });
});
