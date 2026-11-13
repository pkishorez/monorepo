import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUILD_ID_META_NAME,
  BUILT_AT_META_NAME,
  COMMIT_META_NAME,
} from '../../../contract/build/index.js';
import type { ClientBuildInfo } from '../../../contract/config/index.js';
import { headTags } from '../head.js';
import { pwaHead, pwaVersion, splashScreens } from '../index.js';

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
    expect(pwaVersion()).toEqual({
      buildId: 'from-dom',
      builtAt: null,
      commit: 'def5678',
    });
  });

  it('has no Build ID in SSR when the virtual module has none', () => {
    expect(pwaHead().meta.map((m) => m.name)).not.toContain(BUILD_ID_META_NAME);
  });
});
