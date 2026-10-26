// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../commands.ts';
import { useVoiceKeys } from '../layout.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The keys that start and stop a Dictation, as Layout binds them for
 * Voice: Space from the page's or the sidebar's Normal Mode, never where
 * Space types; Ctrl+Space anywhere, typing and in a Picker too. Escape,
 * pressed while one records, does nothing to it.
 */

let asked: Array<string> = [];
let enter: (surface: 'picker' | 'content' | 'sidebar') => void = () => {};

function App() {
  useVoiceKeys({
    toggle: () => void asked.push('Toggle'),
    chooseMicrophone: () => void asked.push('Microphone'),
  });
  enter = keys.useKeyboard().enter;
  const page = keys.useFocusSpot('content', 'page', { default: true });
  const row = keys.useFocusSpot('sidebar', 'row', { default: true });
  return (
    <>
      <keys.Surface id="sidebar">
        <button type="button" ref={row}>
          A row
        </button>
      </keys.Surface>
      <keys.Surface id="content">
        <div ref={page} tabIndex={-1} data-testid="page" />
        <textarea aria-label="Composer" />
      </keys.Surface>
      <keys.Surface id="picker">
        <input aria-label="Search" />
      </keys.Surface>
    </>
  );
}

let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));

const press = async (
  target: Element,
  init: { key: string; code: string; ctrlKey?: boolean },
) => {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', { bubbles: true, ...init }),
    );
  });
  await flush();
};

const space = { key: ' ', code: 'Space' };
const ctrlSpace = { key: ' ', code: 'Space', ctrlKey: true };
const escape = { key: 'Escape', code: 'Escape' };

const focus = async (element: HTMLElement) => {
  await act(async () => element.focus());
  await flush();
};

const byLabel = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

beforeEach(async () => {
  asked = [];
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () =>
    root!.render(
      <keys.Provider vim>
        <App />
      </keys.Provider>,
    ),
  );
  await flush();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('the Dictation’s keys', () => {
  it('start and stop it with Space from the page and the sidebar', async () => {
    const page = document.querySelector<HTMLElement>('[data-testid="page"]')!;
    await focus(page);
    await press(page, space);
    await press(page, escape);
    expect(asked).toEqual(['Toggle']);
    await act(async () => enter('sidebar'));
    await flush();
    await press(document.activeElement ?? document.body, space);
    expect(asked).toEqual(['Toggle', 'Toggle']);
  });

  it('leave Space to the Composer, which types it, and take Ctrl+Space there', async () => {
    await focus(byLabel('Composer'));
    await press(byLabel('Composer'), space);
    expect(asked).toEqual([]);
    await press(byLabel('Composer'), ctrlSpace);
    expect(asked).toEqual(['Toggle']);
  });

  it('take Ctrl+Space in a Picker, whose search Space types into', async () => {
    await act(async () => enter('picker'));
    await focus(byLabel('Search'));
    await press(byLabel('Search'), space);
    await press(byLabel('Search'), ctrlSpace);
    expect(asked).toEqual(['Toggle']);
  });
});
