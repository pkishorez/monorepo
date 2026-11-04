// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeContainer,
  FakeWorker,
} from '../../../../../test/pwa/fake-browser.js';
import { matchCommand } from '../../../engine/contract/commands/index.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Reload Prompt over the real Status and a service worker faked here:
 * it opens once however often it is asked, and Reload applies a newer
 * build downloaded, checks until one is, says after two minutes that it
 * is still rolling out, and with no service worker reloads the page.
 */

let container: FakeContainer;
let reload: ReturnType<typeof vi.fn>;
let root: Root | undefined;

/** A page controlled by an active worker, unless `worker` is false. */
const page = (worker = true) => {
  container = new FakeContainer();
  if (worker) {
    const active = new FakeWorker();
    container.controller = active;
    container.registration.active = active;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: container,
      configurable: true,
    });
  }
};

/** A fresh page load: the module's "asked" is forgotten. */
const load = async () => {
  vi.resetModules();
  return import('../index.js');
};

const render = async () => {
  const { PwaProvider, ReloadPrompt } = await load();
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () =>
    root!.render(
      <PwaProvider>
        <ReloadPrompt title="App was updated" />
      </PwaProvider>,
    ),
  );
  return (await import('../index.js')).updateToNewest;
};

/** Lets timers, promises and the Effect fibers run for `ms`. */
const pass = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const dialogs = () => document.querySelectorAll('[role="alertdialog"]');
const button = () =>
  document.querySelector<HTMLButtonElement>(
    '[role="alertdialog"] [data-slot="alert-dialog-action"]',
  );
const text = () => dialogs()[0]?.textContent ?? '';
const skipWaiting = (worker: FakeWorker) =>
  worker.received.filter((m) => matchCommand(m)._tag === 'Some').length;

beforeEach(() => {
  vi.useFakeTimers();
  reload = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { reload },
    configurable: true,
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.useRealTimers();
});

describe('ReloadPrompt', () => {
  it('opens once PwaProvider has started, once however often it is asked', async () => {
    page();
    const { updateToNewest } = await load();
    updateToNewest();
    const { PwaProvider, ReloadPrompt } = await import('../index.js');
    root = createRoot(document.body.appendChild(document.createElement('div')));
    act(() =>
      root!.render(
        <PwaProvider>
          <ReloadPrompt title="App was updated" />
        </PwaProvider>,
      ),
    );
    expect(dialogs()).toHaveLength(0);
    await pass();
    updateToNewest();
    await pass(100);
    expect(dialogs()).toHaveLength(1);
    expect(text()).toContain('App was updated');
    expect(text()).toContain('Reload to keep going. Nothing is lost.');
    expect(button()?.textContent).toBe('Reload');
    expect(document.activeElement).toBe(button());
  });

  it('stays closed until asked, and has no way to dismiss it', async () => {
    page();
    const updateToNewest = await render();
    await pass();
    expect(dialogs()).toHaveLength(0);
    await act(async () => updateToNewest());
    await pass(100);
    expect(dialogs()[0]?.querySelectorAll('button')).toHaveLength(1);
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    await pass(100);
    expect(dialogs()).toHaveLength(1);
  });

  it('Reload applies a newer build already downloaded, and every page reloads', async () => {
    page();
    const waiting = new FakeWorker();
    container.registration.waiting = waiting;
    const updateToNewest = await render();
    await act(async () => updateToNewest());
    await pass();
    await act(async () => button()!.click());
    await pass();
    expect(skipWaiting(waiting)).toBe(1);
    expect(button()?.textContent).toBe('Getting the new version…');
    await act(async () => {
      container.dispatchEvent(new Event('controllerchange'));
    });
    expect(reload).toHaveBeenCalledOnce();
  });

  it('Reload checks until a newer build is downloaded, saying after two minutes it is still rolling out', async () => {
    page();
    const next = new FakeWorker();
    const updateToNewest = await render();
    await act(async () => updateToNewest());
    await pass();
    const update = container.registration.update;
    const checks = update.mock.calls.length;
    await act(async () => button()!.click());
    await pass(100);
    expect(update.mock.calls.length - checks).toBe(1);
    expect(button()?.textContent).toBe('Getting the new version…');
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      'Getting the new version…',
    );

    await pass(12_000);
    expect(update.mock.calls.length - checks).toBe(2);
    expect(text()).not.toContain('still rolling out');

    await pass(2 * 60_000 - 12_000);
    expect(text()).toContain('The new version is still rolling out.');
    expect(button()?.textContent).toBe('Getting the new version…');
    expect(skipWaiting(next)).toBe(0);

    // The deploy reaches this server: the next check downloads it.
    update.mockImplementation(async () => {
      const registration = container.registration;
      registration.waiting = next;
      registration.dispatchEvent(new Event('updatefound'));
    });
    await pass(12_000);
    expect(skipWaiting(next)).toBe(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('Reload reloads the page itself without a service worker', async () => {
    page(false);
    const updateToNewest = await render();
    await act(async () => updateToNewest());
    await pass();
    expect(text()).toContain('App was updated');
    await act(async () => button()!.click());
    await pass();
    expect(reload).toHaveBeenCalledOnce();
  });
});
