// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keys } from '../../../../../commands.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * About over a PWA and a store faked here: the build and whether it is
 * the newest, a check and an update, the size this browser holds, and a
 * fresh start asked before it clears.
 */

const pwa = vi.hoisted(() => ({
  status: { _tag: 'Ready' } as { _tag: string },
  checkForUpdate: vi.fn(() => Promise.resolve()),
  applyUpdate: vi.fn(() => Promise.resolve()),
}));
const cleared = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const estimate = vi.hoisted(
  () => () => Promise.resolve({ usage: 18_400_000, quota: 1e10 }),
);

vi.mock('@kestack/web-platform/pwa', () => ({
  usePwa: () => ({
    status: pwa.status,
    version: {
      buildId: 'b',
      builtAt: '2026-10-29T12:00:00Z',
      commit: 'ffdc1e7e6abc',
    },
    checkForUpdate: pwa.checkForUpdate,
    applyUpdate: pwa.applyUpdate,
  }),
  useStoragePersistence: () => ({
    persisted: null,
    persist: () => Promise.resolve(null),
    estimate,
  }),
}));
vi.mock('../store.ts', () => ({ clearAndReload: cleared }));

const { AboutView, size } = await import('../view.tsx');

let root: Root | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find(
    (each) => each.textContent === text,
  );
const text = () => document.body.textContent ?? '';

const render = async () => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () =>
    root!.render(
      <keys.Provider vim>
        <keys.Surface id="content">
          <AboutView />
        </keys.Surface>
      </keys.Provider>,
    ),
  );
  await flush();
};

beforeEach(() => {
  pwa.status = { _tag: 'Ready' };
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('About', () => {
  it('names the build by its date and commit', async () => {
    await render();
    expect(text()).toContain('Code app');
    expect(text()).toContain('ffdc1e7');
    expect(text()).not.toContain('ffdc1e7e6');
    expect(text()).toContain('2026');
  });

  it('checks for an update, and says it is up to date', async () => {
    await render();
    await act(async () => byText('Check for updates')!.click());
    await flush();
    expect(pwa.checkForUpdate).toHaveBeenCalledOnce();
    expect(byText('Up to date')).toBeDefined();
  });

  it('updates once a newer build is ready', async () => {
    pwa.status = { _tag: 'UpdateReady' };
    await render();
    expect(text()).toContain('A new version is ready.');
    expect(byText('Check for updates')).toBeUndefined();
    await act(async () => byText('Update now')!.click());
    expect(pwa.applyUpdate).toHaveBeenCalledOnce();
  });

  it('offers no check where there is no service worker', async () => {
    pwa.status = { _tag: 'Unsupported' };
    await render();
    expect(byText('Check for updates')).toBeUndefined();
  });

  it('shows what this browser holds', async () => {
    await render();
    expect(text()).toContain('18.4 MB saved in this browser.');
  });

  it('asks before it clears, and clears only once confirmed', async () => {
    await render();
    await act(async () => byText('Clear…')!.click());
    await flush();
    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain('Clear all data?');
    await act(async () => byText('Cancel')!.click());
    await flush();
    expect(cleared).not.toHaveBeenCalled();

    await act(async () => byText('Clear…')!.click());
    await flush();
    await act(async () => byText('Clear and reload')!.click());
    expect(cleared).toHaveBeenCalledOnce();
  });
});

describe('size', () => {
  it('reads as a person would', () => {
    expect(size(200)).toBe('1 KB');
    expect(size(52_300)).toBe('52 KB');
    expect(size(18_400_000)).toBe('18.4 MB');
    expect(size(2_100_000_000)).toBe('2.1 GB');
  });
});
