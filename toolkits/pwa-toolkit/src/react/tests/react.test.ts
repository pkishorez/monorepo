import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILD_ID_META_NAME } from '../../shared/build/index.js';
import type { ClientBuildInfo } from '../../shared/config/index.js';
import { headTags } from '../head.js';
import { PwaProvider, pwaHead, usePwaUpdate } from '../index.js';

const info: ClientBuildInfo = {
  enabled: true,
  swUrl: '/sw.js',
  scope: '/',
  update: { mode: 'prompt', checkIntervalMinutes: 60 },
  buildId: null,
  manifestUrl: '/manifest.webmanifest',
  appleTouchIconUrl: '/icons/apple-touch-icon.png',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hooks during SSR', () => {
  it('render the documented defaults without touching window', () => {
    const Probe = () => usePwaUpdate().state._tag;
    const html = renderToString(
      createElement(PwaProvider, null, createElement(Probe)),
    );
    expect(html).toBe('Idle');
  });
});

describe('pwaHead', () => {
  it('lists the manifest, Apple icon and the Build ID', () => {
    expect(headTags(info, 'abc')).toEqual({
      meta: [
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: BUILD_ID_META_NAME, content: 'abc' },
      ],
      links: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ],
    });
  });

  it('omits what the build does not have', () => {
    const bare = headTags(
      { ...info, manifestUrl: null, appleTouchIconUrl: null },
      null,
    );
    expect(bare.links).toEqual([]);
    expect(bare.meta.map((m) => m.name)).toEqual(['mobile-web-app-capable']);
  });

  it('reuses the server-rendered Build ID in the browser', () => {
    vi.stubGlobal('document', {
      querySelector: (selector: string) =>
        selector === `meta[name="${BUILD_ID_META_NAME}"]`
          ? { getAttribute: () => 'from-dom' }
          : null,
    });
    expect(pwaHead().meta).toContainEqual({
      name: BUILD_ID_META_NAME,
      content: 'from-dom',
    });
  });

  it('has no Build ID in SSR when the virtual module has none', () => {
    expect(pwaHead().meta.map((m) => m.name)).not.toContain(BUILD_ID_META_NAME);
  });
});
