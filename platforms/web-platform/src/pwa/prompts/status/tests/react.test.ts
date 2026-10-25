import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUILD_ID_META_NAME,
  BUILT_AT_META_NAME,
  COMMIT_META_NAME,
} from '../../../engine/contract/build/index.js';
import type { ClientBuildInfo } from '../../../engine/contract/config/index.js';
import { splashScreens } from '../../splash/index.ts';
import { headTags } from '../head.js';
import { PwaProvider, pwaHead, usePwa } from '../index.js';

const info: ClientBuildInfo = {
  enabled: true,
  swUrl: '/sw.js',
  scope: '/',
  update: { checkIntervalMinutes: 60 },
  buildId: null,
  builtAt: null,
  commit: null,
  name: 'App',
  title: 'App',
  splash: false,
  manifestUrl: '/manifest.webmanifest',
  appleTouchIconUrl: '/icons/apple-touch-icon.png',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hooks during SSR', () => {
  it('render the documented defaults without touching window', () => {
    const Probe = () => usePwa().status._tag;
    const html = renderToString(
      createElement(PwaProvider, null, createElement(Probe)),
    );
    expect(html).toBe('Unsupported');
  });
});

describe('pwaHead', () => {
  it('lists the manifest, Apple icon and title, Build ID, build time and commit', () => {
    const version = {
      buildId: 'abc',
      builtAt: '2026-09-27T10:00:00.000Z',
      commit: 'abc1234',
    };
    expect(headTags(info, version)).toEqual({
      meta: [
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'App' },
        { name: BUILD_ID_META_NAME, content: 'abc' },
        { name: BUILT_AT_META_NAME, content: '2026-09-27T10:00:00.000Z' },
        { name: COMMIT_META_NAME, content: 'abc1234' },
      ],
      links: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ],
    });
  });

  it('omits what the build does not have', () => {
    const bare = headTags(
      { ...info, appleTouchIconUrl: null },
      { buildId: null, builtAt: null, commit: null },
    );
    expect(bare.links).toEqual([
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ]);
    expect(bare.meta.map((m) => m.name)).toEqual([
      'mobile-web-app-capable',
      'apple-mobile-web-app-title',
    ]);
  });

  it('leaves iOS out of its legacy mode unless the app draws a Splash', () => {
    const none = { buildId: null, builtAt: null, commit: null };
    const capable = { name: 'apple-mobile-web-app-capable', content: 'yes' };
    const startup = (tags: ReturnType<typeof headTags>) =>
      tags.links.filter((link) => link.rel === 'apple-touch-startup-image');
    const plain = headTags(info, none);
    expect(plain.meta).not.toContainEqual(capable);
    expect(startup(plain)).toEqual([]);
    const splash = headTags({ ...info, splash: true }, none);
    expect(splash.meta).toContainEqual(capable);
    expect(startup(splash)).toHaveLength(splashScreens.length);
  });

  it('reuses the server-rendered tags in the browser', () => {
    const rendered: Record<string, string> = {
      [BUILD_ID_META_NAME]: 'from-dom',
      [COMMIT_META_NAME]: 'def5678',
    };
    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        const name = /name="(.+)"/.exec(selector)?.[1] ?? '';
        const content = rendered[name];
        return content === undefined ? null : { getAttribute: () => content };
      },
    });
    expect(pwaHead().meta).toContainEqual({
      name: BUILD_ID_META_NAME,
      content: 'from-dom',
    });
    const Probe = () => JSON.stringify(usePwa().version);
    expect(renderToString(createElement(Probe))).toBe(
      JSON.stringify({
        buildId: 'from-dom',
        builtAt: null,
        commit: 'def5678',
      }).replaceAll('"', '&quot;'),
    );
  });

  it('has no Build ID in SSR when the virtual module has none', () => {
    expect(pwaHead().meta.map((m) => m.name)).not.toContain(BUILD_ID_META_NAME);
  });
});
