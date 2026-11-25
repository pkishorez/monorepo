// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevtoolsDialog } from './devtools-dialog.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Dialog beside a page it never wraps: opened from its button or the
 * keys, closed by them or by Escape, and hidden, not taken down, so what
 * was chosen in it is still chosen; never opened, it is not drawn at all.
 */

// jsdom has neither: a wide screen, unless a test says a phone's, and a
// size that never changes.
let phone = false;
Object.assign(window, {
  matchMedia: (query: string) => ({
    matches: phone,
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

const page = () => host.querySelector<HTMLElement>('main');

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <>
        <main />
        <DevtoolsDialog devtools={<Chooser />} />
      </>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  phone = false;
  vi.useRealTimers();
});

const click = (element: Element) =>
  act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const toggle = () => click(host.querySelector('button[aria-pressed]')!);
const press = (init: KeyboardEventInit) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    vi.runAllTimers();
  });
const choice = () =>
  host.querySelector<HTMLButtonElement>('[data-testid="choice"]');
const dialog = () => host.querySelector<HTMLElement>('[role="dialog"]');

describe('the Devtools Dialog', () => {
  it('draws nothing of the devtools until first opened, and leaves the page where it is', () => {
    expect(choice()).toBeNull();
    const before = page();
    toggle();
    expect(dialog()!.hidden).toBe(false);
    expect(page()).toBe(before);
    expect(page()!.parentElement).toBe(host);
  });

  it('hides the devtools when closed, and keeps what was chosen in them', () => {
    toggle();
    click(choice()!);
    expect(choice()!.textContent).toBe('one');

    toggle();
    expect(dialog()!.hidden).toBe(true);
    expect(choice()!.textContent).toBe('one');

    toggle();
    expect(dialog()!.hidden).toBe(false);
    expect(choice()!.textContent).toBe('one');
  });

  it('opens and closes with Ctrl+/, and closes with Escape', () => {
    press({ key: '/', ctrlKey: true });
    expect(dialog()!.hidden).toBe(false);
    press({ key: '/', metaKey: true });
    expect(dialog()!.hidden).toBe(true);

    press({ key: '/', ctrlKey: true });
    press({ key: 'Escape' });
    expect(dialog()!.hidden).toBe(true);
  });

  it('stays open on an Escape something inside took first', () => {
    toggle();
    const took = (event: KeyboardEvent) => event.preventDefault();
    window.addEventListener('keydown', took);
    press({ key: 'Escape' });
    window.removeEventListener('keydown', took);
    expect(dialog()!.hidden).toBe(false);
  });

  it('on a phone with onPhones off, draws no button and keeps the devtools closed', () => {
    // Kept open, read on mount: a fresh root reads it.
    act(() => root.unmount());
    root = createRoot(host);
    localStorage.setItem('devtools-dialog', JSON.stringify({ open: true }));
    phone = true;
    act(() =>
      root.render(
        <>
          <main />
          <DevtoolsDialog onPhones={false} devtools={<Chooser />} />
        </>,
      ),
    );
    expect(host.querySelector('button[aria-pressed]')).toBeNull();
    expect(choice()).toBeNull();
    expect(page()).not.toBeNull();
  });
});
