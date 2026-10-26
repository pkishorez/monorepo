// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../../../../device/account/connections/layout/commands.ts';
import { Dialog, useOpen } from '../confirm.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A confirmation opened from a button on the page.
 * Focus starts on keeping things, and comes back to the button however
 * it closes: kept, by Escape, or done.
 */

let active = '';
let done = () => {};

function Page() {
  const [asked, setAsked] = useState(false);
  done = () => setAsked(false);
  active = keys.useKeyboard().active;
  const open = useOpen();
  const spot = keys.useFocusSpot('content', 'opener');
  return (
    <keys.Surface id="content">
      <button
        type="button"
        ref={spot}
        onClick={() => open(() => setAsked(true))}
      >
        Remove
      </button>
      <Dialog
        open={asked}
        title="Remove it?"
        description="It goes."
        problem={null}
        busy={false}
        keep="Keep it"
        confirm="Remove it"
        onClose={() => setAsked(false)}
        onConfirm={() => {}}
      />
    </keys.Surface>
  );
}

let root: Root | undefined;

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find(
    (each) => each.textContent === text,
  );
const dialog = () => document.querySelector('[role="alertdialog"]');

const opened = async () => {
  await act(async () => {
    byText('Remove')!.focus();
    byText('Remove')!.click();
  });
  await flush();
  expect(dialog()).not.toBeNull();
  expect(active).toBe('confirm');
  expect(document.activeElement).toBe(byText('Keep it'));
};

const closedBackOnTheButton = async () => {
  await flush();
  expect(dialog()).toBeNull();
  expect(active).toBe('content');
  expect(document.activeElement).toBe(byText('Remove'));
};

beforeEach(async () => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () =>
    root!.render(
      <keys.Provider vim>
        <Page />
      </keys.Provider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('a confirmation', () => {
  it('gives focus back to its button when kept', async () => {
    await opened();
    await act(async () => byText('Keep it')!.click());
    await closedBackOnTheButton();
  });

  it('gives focus back to its button on Escape', async () => {
    await opened();
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await closedBackOnTheButton();
  });

  it('gives focus back to its button once its owner is done with it', async () => {
    await opened();
    await act(async () => done());
    await closedBackOnTheButton();
  });
});
