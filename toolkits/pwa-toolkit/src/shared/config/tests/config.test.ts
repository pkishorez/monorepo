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
  it('fills every default for empty options', () => {
    const config = resolvePwaConfig(decodeOptions({}));
    expect(config).toMatchObject({
      enabled: true,
      dev: false,
      preset: 'app',
      manifest: null,
      precache: { include: [], exclude: [], warnAboveBytes: 5 * 1024 * 1024 },
      navigation: {
        shell: true,
        shellPath: '/_shell',
        offlineFallback: '/offline',
        networkTimeoutMs: 3000,
        cachePages: false,
        denylist: [],
      },
      neverCache: ['/api/auth/'],
      update: { checkIntervalMinutes: 60 },
      worker: null,
      swUrl: '/sw.js',
    });
    expect(config.strategies.map((rule) => rule.cacheName)).toEqual(['images']);
  });

  it('puts explicit options over the preset and user rules first', () => {
    const config = resolvePwaConfig(
      decodeOptions({
        preset: 'content',
        manifest,
        navigation: { shell: true },
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
    expect(config.navigation.shell).toBe(true);
    expect(config.navigation.cachePages).toBe(true);
    expect(config.strategies.map((rule) => rule.cacheName)).toEqual([
      'api',
      'images',
    ]);
    expect(config.update).toEqual({ checkIntervalMinutes: 5 });
  });

  it('rejects invalid options', () => {
    expect(() => decodeOptions({ preset: 'blog' })).toThrow();
    expect(() => decodeOptions({ swUrl: 'sw.js' })).toThrow();
    expect(() =>
      decodeOptions({ update: { checkIntervalMinutes: 0 } }),
    ).toThrow();
  });
});

describe('virtual module shapes', () => {
  it('round-trip through their schemas', () => {
    const config = resolvePwaConfig(decodeOptions({}));
    const worker = {
      buildId: 'abc',
      precache: [{ url: '/offline', revision: 'r1' }],
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
      manifestUrl: '/manifest.webmanifest',
      appleTouchIconUrl: null,
    });
    expect(client.buildId).toBeNull();
  });
});
