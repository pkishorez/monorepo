// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { View } from '@kestack/kabuki/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../../../../../frame/commands.ts';
import { preferencesMemory } from '../../../../../../storage/index.ts';
import { GeneralView } from '../view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * General over Preferences in memory: Keep Screen On starts on, and stays
 * as it is switched once Preferences is read again after the write.
 */

let apps = 0;
let root: Root | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));

const keepScreenOn = () =>
  document.querySelector<HTMLButtonElement>(
    'button[role="switch"][aria-labelledby="keep-screen-on-name"]',
  );

const settled = async () => {
  for (let tries = 0; tries < 10; tries++) await flush();
};

const flip = async () => {
  await act(async () => keepScreenOn()!.click());
  await settled();
};

beforeEach(async () => {
  const App = View.app(GeneralView, {
    layer: preferencesMemory(),
    name: `general-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () =>
    root!.render(
      <keys.Provider>
        <App />
      </keys.Provider>,
    ),
  );
  for (let tries = 0; tries < 50 && keepScreenOn() === null; tries++)
    await flush();
  expect(keepScreenOn()).not.toBeNull();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Keep screen on', () => {
  it('starts on', () => {
    expect(keepScreenOn()!.getAttribute('aria-checked')).toBe('true');
  });

  it('stays as it is switched, off and on again', async () => {
    await flip();
    expect(keepScreenOn()!.getAttribute('aria-checked')).toBe('false');
    await flip();
    expect(keepScreenOn()!.getAttribute('aria-checked')).toBe('true');
  });
});
