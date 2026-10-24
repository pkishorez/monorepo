import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import { WebAppManifest, withManifestDefaults } from '../../manifest/index.js';
import {
  ClientBuildInfo,
  PwaOptions,
  resolvePwaConfig,
  WorkerBuildInfo,
  workerConfigOf,
} from '../index.js';

const decodeOptions = Schema.decodeUnknownSync(PwaOptions);

const manifest = {
  name: 'Todo',
  short_name: 'Todo',
  description: 'Todos offline',
  theme_color: '#0f172a',
  background_color: '#ffffff',
  display_override: ['window-controls-overlay', 'standalone'],
  orientation: 'portrait',
  categories: ['productivity'],
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', purpose: 'any maskable' },
  ],
  screenshots: [{ src: '/s.png', sizes: '1280x720', form_factor: 'wide' }],
  shortcuts: [{ name: 'New', url: '/new' }],
} as const;

describe('WebAppManifest', () => {
  it('decodes a full manifest and fills defaults', () => {
    const decoded = Schema.decodeUnknownSync(WebAppManifest)(manifest);
    expect(withManifestDefaults(decoded)).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
  });

  it('rejects unknown display values and icon purposes', () => {
    const decode = Schema.decodeUnknownSync(WebAppManifest);
    expect(() => decode({ name: 'x', display: 'window' })).toThrow();
    expect(() =>
      decode({ name: 'x', icons: [{ src: '/a', purpose: 'big' }] }),
    ).toThrow();
  });
});

describe('resolvePwaConfig', () => {
  it('fills every default from the name alone', () => {
    const config = resolvePwaConfig(decodeOptions({ name: 'Todo' }));
    expect(config).toMatchObject({
      enabled: true,
      dev: false,
      preset: 'app',
      precache: { include: [], exclude: [], warnAboveBytes: 5 * 1024 * 1024 },
      navigation: { networkTimeoutMs: 3000, denylist: [] },
      neverCache: ['/api/auth/'],
      update: { checkIntervalMinutes: 60 },
      worker: null,
      swUrl: '/sw.js',
    });
    expect(config.strategies.map((rule) => rule.cacheName)).toEqual(['images']);
  });

  it("gives the manifest the default Theme's colors and the icons in public/", () => {
    const { manifest } = resolvePwaConfig(decodeOptions({ name: 'Todo' }));
    expect(manifest).toMatchObject({
      name: 'Todo',
      theme_color: '#0a0a0a',
      background_color: '#0a0a0a',
    });
    expect(manifest.icons?.map((icon) => icon.src)).toEqual([
      '/icon-192.png',
      '/icon-512.png',
      '/icon-maskable-512.png',
      '/apple-touch-icon.png',
    ]);
  });

  it("puts the app's manifest fields over the defaults", () => {
    const { name, ...rest } = manifest;
    const config = resolvePwaConfig(decodeOptions({ name, manifest: rest }));
    expect(config.manifest).toMatchObject({
      name: 'Todo',
      theme_color: '#0f172a',
      background_color: '#ffffff',
      icons: rest.icons,
    });
  });

  it('puts explicit options over the preset and user rules first', () => {
    const config = resolvePwaConfig(
      decodeOptions({
        name: 'Todo',
        preset: 'content',
        navigation: { networkTimeoutMs: 500 },
        strategies: [
          {
            match: { pathPrefix: '/api/' },
            strategy: 'network-first',
            cacheName: 'api',
          },
        ],
        update: { checkIntervalMinutes: 5 },
      }),
    );
    expect(config.navigation.networkTimeoutMs).toBe(500);
    expect(config.strategies.map((rule) => rule.cacheName)).toEqual([
      'api',
      'images',
    ]);
    expect(config.update).toEqual({ checkIntervalMinutes: 5 });
  });

  it('rejects invalid options', () => {
    expect(() => decodeOptions({})).toThrow();
    expect(() => decodeOptions({ name: 'x', preset: 'blog' })).toThrow();
    expect(() => decodeOptions({ name: 'x', swUrl: 'sw.js' })).toThrow();
    expect(() =>
      decodeOptions({ name: 'x', update: { checkIntervalMinutes: 0 } }),
    ).toThrow();
  });
});

describe('virtual module shapes', () => {
  it('round-trip through their schemas', () => {
    const config = resolvePwaConfig(decodeOptions({ name: 'Todo' }));
    const worker = {
      buildId: 'abc',
      precache: [{ url: '/assets/app.js', revision: 'r1' }],
      config: workerConfigOf(config),
    };
    expect(Schema.decodeUnknownSync(WorkerBuildInfo)(worker).buildId).toBe(
      'abc',
    );
    const client = Schema.decodeUnknownSync(ClientBuildInfo)({
      enabled: true,
      swUrl: '/sw.js',
      scope: '/',
      update: config.update,
      buildId: null,
      builtAt: null,
      commit: null,
      name: 'Todo',
      manifestUrl: '/manifest.webmanifest',
      appleTouchIconUrl: null,
    });
    expect(client.buildId).toBeNull();
  });
});
