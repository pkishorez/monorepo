// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { usePress } from '../touch.ts';

/*
 * Whether a press begun in the Touch Draft's card is under way. The app
 * draws the whole document, so React hears a press on the document
 * itself, before any listener added there after it: the card's own
 * handler runs first, and the press must still count as the card's.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let undo: Array<() => void> = [];
afterEach(() => {
  for (const step of undo) step();
  undo = [];
});

/** The hook, mounted, and the card's own handler for a press. */
const mount = async () => {
  let press: ReturnType<typeof usePress> | null = null;
  function Probe() {
    press = usePress();
    return null;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<Probe />));
  undo.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return () => press!;
};

/**
 * Hears every press on the document before anything added later, as
 * React does where its root is the document, and says it was the card's.
 */
const cardFirst = (press: () => ReturnType<typeof usePress>) => {
  const heard = () => press().onPointerDownCapture();
  document.addEventListener('pointerdown', heard, true);
  undo.push(() => document.removeEventListener('pointerdown', heard, true));
};

const down = (target: Element) =>
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }));

describe('a press in the Touch Draft', () => {
  it('counts as the card’s when the card hears it before anything else on the document', async () => {
    let press: () => ReturnType<typeof usePress> = () => {
      throw new Error('not mounted');
    };
    // Added before the hook mounts, as React's listeners are.
    cardFirst(() => press());
    press = await mount();
    down(document.body);
    expect(press().pressing()).toBe(true);
  });

  it('ends with its click, and a press the card does not hear is outside', async () => {
    const press = await mount();
    down(document.body);
    press().onPointerDownCapture();
    expect(press().pressing()).toBe(true);
    document.body.click();
    expect(press().pressing()).toBe(false);
    down(document.body);
    expect(press().pressing()).toBe(false);
  });
});
