import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILD_ID_META_NAME } from '../domain/build/index.js';
import type { ClientBuildInfo } from '../domain/config/index.js';
import { headTags } from './head.js';
import {
  PwaProvider,
  pwaHead,
  useDisplayMode,
  useOnline,
  usePwaInstall,
  usePwaUpdate,
  useStoragePersistence,
} from './index.js';

const info: ClientBuildInfo = {
  enabled: true,
  swUrl: '/sw.js',
  scope: '/',
  update: { mode: 'prompt', checkIntervalMinutes: 60 },
  buildId: null,
  manifestUrl: '/manifest.webmanifest',
  themeColor: '#123456',
  appleTouchIconUrl: '/icons/apple-touch-icon.png',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hooks during SSR', () => {
  it('render the documented defaults without touching window', () => {
    const Probe = () =>
      JSON.stringify({
        update: usePwaUpdate().state._tag,
        install: usePwaInstall().state._tag,
        online: useOnline(),
        mode: useDisplayMode(),
        persisted: useStoragePersistence().persisted,
      });
    const html = renderToString(
      createElement(PwaProvider, null, createElement(Probe)),
    );
    expect(JSON.parse(html.replaceAll('&quot;', '"'))).toEqual({
      update: 'Idle',
      install: 'Unsupported',
      online: true,
      mode: 'browser',
      persisted: null,
    });
  });
});

describe('pwaHead', () => {
  it('lists manifest, theme-color, Apple meta and icon, and the Build ID', () => {
    expect(headTags(info, 'abc')).toEqual({
      meta: [
        { name: 'theme-color', content: '#123456' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
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
      { ...info, manifestUrl: null, themeColor: null, appleTouchIconUrl: null },
      null,
    );
    expect(bare.links).toEqual([]);
    expect(bare.meta.map((m) => m.name)).toEqual([
      'mobile-web-app-capable',
      'apple-mobile-web-app-capable',
    ]);
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
