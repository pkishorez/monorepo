// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevtoolsDock } from './devtools-dock.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Dock closed and opened again: the devtools are hidden, not taken
 * down, so what was chosen in them is still chosen; never opened, they
 * are not drawn at all.
 */

// jsdom has neither: a wide screen, and a size that never changes.
Object.assign(window, {
  matchMedia: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
});
Object.assign(globalThis, {
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});

/** Devtools with a choice of their own, as a Map's selection is. */
function Chooser() {
  const [chosen, choose] = useState('none');
  return (
    <button type="button" data-testid="choice" onClick={() => choose('one')}>
      {chosen}
    </button>
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <DevtoolsDock devtools={() => <Chooser />}>
        <main />
      </DevtoolsDock>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const toggle = () =>
  act(() =>
    host
      .querySelector<HTMLButtonElement>('button[aria-pressed]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
const choice = () =>
  host.querySelector<HTMLButtonElement>('[data-testid="choice"]');
const dialog = () => host.querySelector<HTMLElement>('[role="dialog"]');

describe('the Devtools Dock', () => {
  it('draws nothing of the devtools until first opened', () => {
    expect(choice()).toBeNull();
  });

  it('hides the devtools when closed, and keeps what was chosen in them', () => {
    toggle();
    act(() =>
      choice()!.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(choice()!.textContent).toBe('one');

    toggle();
    expect(dialog()!.hidden).toBe(true);
    expect(choice()!.textContent).toBe('one');

    toggle();
    expect(dialog()!.hidden).toBe(false);
    expect(choice()!.textContent).toBe('one');
  });
});
