// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FloatingDevtools, KabukiDevtools } from '../index.ts';
import { css } from '../styles.gen.ts';
import { LiveShop } from './fixtures/views.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The devtools on the bigger Shop, running: drawn in a shadow root that
 * holds their own styles, opened from the corner button, and drawn on a
 * server as their host alone.
 */

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollTo ??= function () {};
});

let root: Root | undefined;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const mount = async (element: React.ReactNode) => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
};

const shadowOf = () =>
  host.querySelector<HTMLElement>('[data-kabuki-devtools]')!.shadowRoot!;

function Live({ floating = false }: { readonly floating?: boolean }) {
  const runtime = LiveShop.useRuntime();
  return (
    <>
      <LiveShop />
      {floating ? (
        <FloatingDevtools runtime={runtime} />
      ) : (
        <KabukiDevtools runtime={runtime} />
      )}
    </>
  );
}

describe('KabukiDevtools', () => {
  it('draws the Inspector in a shadow root, with its own styles', async () => {
    await mount(<Live />);
    const shadow = shadowOf();
    expect(shadow.querySelector('style')!.textContent).toBe(css);
    expect(shadow.querySelector('[aria-label="Steps"]')).not.toBeNull();
    expect(shadow.textContent).toContain('init');
    // Nothing of the devtools is in the page itself.
    expect(host.querySelector('[aria-label="Steps"]')).toBeNull();
  });

  it('draws only its host on a server', () => {
    const html = renderToString(<KabukiDevtools runtime={null as never} />);
    expect(html).toBe('<div data-kabuki-devtools=""></div>');
  });
});

describe('FloatingDevtools', () => {
  it('opens the devtools from the corner button, and closes them', async () => {
    await mount(<Live floating />);
    const shadow = shadowOf();
    const button = () =>
      shadow.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(shadow.querySelector('[aria-label="Steps"]')).toBeNull();

    await act(async () => button().click());
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(shadow.querySelector('[aria-label="Steps"]')).not.toBeNull();

    await act(async () => button().click());
    expect(shadow.querySelector('[aria-label="Steps"]')).toBeNull();
  });
});
