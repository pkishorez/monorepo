// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toReact } from '@kestack/kabuki/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../../../keys.ts';
import { DeviceState } from '../../device-state/index.ts';
import { ShortcutsLive } from './actor.ts';
import { ShortcutsView } from './view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * Shortcut settings on the app's own keyboard, over Device State in
 * memory: clicking a row's keys records the next key pressed, while no key
 * of the app works; Escape keeps the old keys; a key another Action on
 * the Surface has offers to Swap.
 */

let toSettings = 0;

function Probe() {
  keys.useAction('app.settings', () => {
    toSettings += 1;
  });
  return null;
}

let apps = 0;
let root: Root | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));

const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(
    `button[aria-label="Change the keys for ${label}"]`,
  );
const recorder = () =>
  document.querySelector<HTMLElement>('[data-surface="record"]');
const rowOf = (label: string) => button(label)?.closest('li');

const press = async (
  name: string,
  code: string,
  init: KeyboardEventInit = {},
) => {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        code,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key: name, code, bubbles: true, ...init }),
    );
  });
  await flush();
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    element.focus();
    element.click();
  });
  await flush();
};

/** Starts recording a new key for the Action labelled `label`. */
const record = async (label: string) => {
  await click(button(label)!);
  await flush();
  expect(document.activeElement).toBe(recorder());
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(async () => {
  toSettings = 0;
  const App = toReact(ShortcutsLive, ShortcutsView, DeviceState.memory(), {
    name: `shortcuts-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () =>
    root!.render(
      <keys.Provider vim>
        <Probe />
        <keys.Surface id="content">
          <App />
        </keys.Surface>
      </keys.Provider>,
    ),
  );
  for (let tries = 0; tries < 50 && button('Scroll up') === null; tries++)
    await flush();
  expect(button('Scroll up')).not.toBeNull();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Shortcut settings', () => {
  it('records the next key in place of the old ones, and no app key works meanwhile', async () => {
    await record('Pick the model');
    // Ctrl+, goes to Settings, but not while recording.
    await press(',', 'Comma', { ctrlKey: true });
    expect(toSettings).toBe(0);
    expect(recorder()).toBeNull();
    expect(rowOf('Pick the model')?.textContent).toContain(',');
    expect(document.activeElement).toBe(button('Pick the model'));
    // A nearer Surface's key is allowed, with a note on the one it hides.
    expect(rowOf('Settings, or back from them')?.textContent).toContain(
      'does “Pick the model” instead',
    );
    // Recording over, the key works again (this keyboard is not handed the Bindings).
    await press(',', 'Comma', { ctrlKey: true });
    expect(toSettings).toBe(1);
  });

  it('keeps the old keys on Escape', async () => {
    const before = rowOf('Scroll up')?.textContent;
    await record('Scroll up');
    await press('Escape', 'Escape');
    expect(recorder()).toBeNull();
    expect(rowOf('Scroll up')?.textContent).toBe(before);
    expect(document.activeElement).toBe(button('Scroll up'));
  });

  it('waits past a modifier alone for the key it holds', async () => {
    await record('Scroll up');
    await press('Shift', 'ShiftLeft', { shiftKey: true });
    expect(recorder()).not.toBeNull();
    await press('U', 'KeyU', { shiftKey: true });
    expect(recorder()).toBeNull();
    expect(
      rowOf('Scroll up')?.querySelector('button[aria-label^="Reset"]'),
    ).not.toBeNull();
  });

  it('names the holder of a key on the same Surface, and swaps their keys', async () => {
    await record('Scroll up');
    await press('j', 'KeyJ');
    const alert = rowOf('Scroll up')?.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('is already “Scroll down”');
    const swap = [...(alert?.querySelectorAll('button') ?? [])].find(
      (each) => each.textContent === 'Swap their keys',
    );
    await click(swap!);
    expect(rowOf('Scroll up')?.querySelector('[role="alert"]')).toBeNull();
    expect(rowOf('Scroll up')?.textContent).toContain('J');
    expect(rowOf('Scroll down')?.textContent).toContain('K');
  });

  it('resets with an Action the ones Swaps gave its defaults to, and says so', async () => {
    const swapIn = async (label: string, key: string) => {
      await record(label);
      await press(key, `Key${key.toUpperCase()}`);
      const swap = [
        ...(rowOf(label)?.querySelectorAll<HTMLElement>(
          '[role="alert"] button',
        ) ?? []),
      ].find((each) => each.textContent === 'Swap their keys');
      await click(swap!);
    };
    await swapIn('Open a project', 's');
    await swapIn('Switch session', 'a');
    expect(rowOf('Session actions')?.textContent).toContain('O');
    await click(
      rowOf('Open a project')!.querySelector<HTMLElement>(
        'button[aria-label^="Reset"]',
      )!,
    );
    expect(
      rowOf('Open a project')?.querySelector('[role="status"]')?.textContent,
    ).toBe(
      'Also reset “Session actions” and “Switch session”, whose keys its defaults would have clashed with.',
    );
    expect(
      document.querySelectorAll('button[aria-label^="Reset"]'),
    ).toHaveLength(0);
  });

  it('refuses a key that types for an Action that works while typing', async () => {
    const label = 'Settings, or back from them';
    const before = rowOf(label)?.textContent;
    await record(label);
    await press('m', 'KeyM');
    const alert = rowOf(label)?.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('would type in a text field');
    expect(
      rowOf(label)?.querySelector('button[aria-label^="Reset"]'),
    ).toBeNull();
    expect(rowOf(label)?.textContent).toContain(before?.slice(0, 14) ?? '');
  });

  it('resets every Action to its defaults', async () => {
    await record('Scroll up');
    await press('y', 'KeyY');
    const resetAll = [...document.querySelectorAll('button')].find(
      (each) => each.textContent === 'Reset all',
    )!;
    expect(resetAll.disabled).toBe(false);
    await click(resetAll);
    expect(resetAll.disabled).toBe(true);
    expect(rowOf('Scroll up')?.textContent).toContain('K');
  });
});
