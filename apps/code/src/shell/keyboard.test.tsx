// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keys } from '../keys.ts';
import { Keyboard } from './keyboard.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The app's keyboard follows the device, not the screen's width: with no
 * keyboard, Vim Mode is off whatever is kept and cannot be turned on, and
 * nothing takes focus on its own, a default Focus Spot included.
 */

let root: ReactRoot | undefined;
let keyboard: ReturnType<typeof keys.useKeyboard>;

function Page() {
  keyboard = keys.useKeyboard();
  const spot = keys.useFocusSpot('content', 'page', { default: true });
  return (
    <keys.Surface id="content">
      <textarea ref={spot} data-testid="page" />
    </keys.Surface>
  );
}

const mount = async (device: 'keyboard' | 'touch') => {
  document.documentElement.toggleAttribute(
    'data-keyboard',
    device === 'keyboard',
  );
  const onVimChange = vi.fn();
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () =>
    root!.render(
      <Keyboard vim bindings={{}} onVimChange={onVimChange}>
        <Page />
      </Keyboard>,
    ),
  );
  return { onVimChange };
};

const page = () => document.querySelector('[data-testid="page"]');

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Keyboard', () => {
  it('keeps Vim Mode as kept, and focus following the keys, with a keyboard', async () => {
    const { onVimChange } = await mount('keyboard');
    expect(keyboard.vim.on).toBe(true);
    act(() => keyboard.vim.set(false));
    expect(onVimChange).toHaveBeenCalledWith(false);
    await act(async () => keyboard.enter('content'));
    expect(document.activeElement).toBe(page());
  });

  it('turns Vim Mode off, and focus moves on its own nowhere, with no keyboard', async () => {
    const { onVimChange } = await mount('touch');
    expect(keyboard.vim.on).toBe(false);
    act(() => keyboard.vim.set(true));
    expect(onVimChange).not.toHaveBeenCalled();
    // The device is read once per page: the test before this one's keyboard
    // was seen for a moment as this one mounted. Start from nothing.
    await act(async () => (document.activeElement as HTMLElement).blur());
    await act(async () => keyboard.enter('content'));
    expect(document.activeElement).not.toBe(page());
  });
});
