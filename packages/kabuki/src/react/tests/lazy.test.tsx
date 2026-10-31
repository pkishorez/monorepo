// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { prerender } from 'react-dom/static';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Actor } from '../../core/index.ts';
import { View } from '../index.ts';
import type { AnyActor } from '../../core/actor/index.ts';
import type { LazyView, ViewOf } from '../view/index.ts';
import { registry } from '../view/registry.ts';
import { Ticker } from './lazy/ticker.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A lazy View: loaded when first drawn, waited for by a server, preloaded
 * before a browser hydrates, and told to the App so a server knows which it
 * drew. Its Actor stays eager.
 */

const html = async (node: React.ReactNode) => {
  const { prelude } = await prerender(node);
  let out = '';
  const reader = prelude.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out += decoder.decode(value);
  }
};

/** A parent drawing the Ticker as its fixed Child, through whichever View it is given. */
const pageWith = (TickerView: ViewOf<typeof Ticker>) => {
  const Page = Actor.define('Page', {}).build({
    children: { ticker: Actor.child(Ticker) },
  });
  const PageView = View.make(Page, (self) => (
    <main>
      <TickerView instance={self.children.ticker} />
    </main>
  ));
  return View.app(PageView);
};

let host: HTMLDivElement;
let root: ReactRoot | undefined;
let made = 0;
/** A lazy Ticker View, by default with a fresh id, so each test loads it anew. */
const lazyTicker = (id = `ticker-${made++}`) =>
  View.lazy(Ticker, () => import('./lazy/ticker-view.tsx'), { id });

beforeEach(() => {
  registry.clear();
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host.remove();
  vi.restoreAllMocks();
});

describe('a lazy View', () => {
  it('is loaded by preload, and says so', async () => {
    const TickerView = lazyTicker();
    expect(TickerView.loaded).toBe(false);
    await TickerView.preload();
    expect(TickerView.loaded).toBe(true);
    expect(TickerView.id).toBe(`ticker-${made - 1}`);
  });

  it('a server waits for it, and is told which lazy Views it drew', async () => {
    const TickerView = lazyTicker();
    const App = pageWith(TickerView);
    const used = new Set<LazyView<AnyActor>>();
    const served = await html(<App onLazyView={(view) => used.add(view)} />);
    expect(served).toContain('<output data-ticker="true">0</output>');
    expect([...used].map((view) => view.id)).toEqual([TickerView.id]);
  });

  it('preloaded by id, hydrates without drawing the fallback or a mismatch', async () => {
    const OnServer = pageWith(lazyTicker('ticker-hydrated'));
    const ids: Array<string> = [];
    const served = await html(
      <OnServer onLazyView={(view) => view.id && ids.push(view.id)} />,
    );

    // The browser's own module: nothing loaded until the ids the server drew are preloaded.
    const TickerView = lazyTicker('ticker-hydrated');
    const App = pageWith(TickerView);
    expect(TickerView.loaded).toBe(false);
    await View.preload([...ids, 'not-a-lazy-view']);
    expect(TickerView.loaded).toBe(true);

    host.innerHTML = served;
    const fallback = vi.fn(() => null);
    const Fallback = () => fallback();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      root = hydrateRoot(host, <App fallback={<Fallback />} />);
    });
    expect(fallback).not.toHaveBeenCalled();
    const about = errors.mock.calls.map((call) => String(call[0]));
    expect(about.filter((e) => !e.includes('multiple renderers'))).toEqual([]);
    expect(host.querySelector('[data-ticker]')?.textContent).toBe('0');
  });

  it('not loaded yet, a browser draws the fallback until it is', async () => {
    // Loads only once let through, so the fallback is seen first.
    let letThrough!: () => void;
    const held = new Promise<void>((resolve) => (letThrough = resolve));
    const TickerView = View.lazy(Ticker, () =>
      held.then(() => import('./lazy/ticker-view.tsx')),
    );
    const App = pageWith(TickerView);
    root = createRoot(host);
    await act(async () => root!.render(<App fallback="loading" />));
    expect(host.textContent).toBe('loading');
    letThrough();
    await act(() => TickerView.preload());
    expect(host.querySelector('[data-ticker]')?.textContent).toBe('0');
  });

  it('is the root View too', async () => {
    const App = View.app(lazyTicker());
    expect(await html(<App />)).toContain(
      '<output data-ticker="true">0</output>',
    );
  });
});
