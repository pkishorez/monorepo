import { describe, expect, it } from 'vitest';
import { BuildId } from '../domain/build/index.js';
import { resolvePwaConfig } from '../domain/config/index.js';
import { clientBuildInfo } from './client-info.js';
import { assertAfterStart } from './start-setup.js';

const buildId = BuildId.make('abc');

describe('clientBuildInfo', () => {
  const config = resolvePwaConfig({
    manifest: {
      name: 'x',
      theme_color: '#000',
      icons: [
        { src: '/mask.png', type: 'image/png', purpose: 'maskable' },
        { src: '/any.png', type: 'image/png' },
      ],
    },
  });

  it('gives the Build ID to the server environment only', () => {
    const build = { serving: false, buildId };
    expect(
      clientBuildInfo(config, { ...build, consumer: 'client' }).buildId,
    ).toBeNull();
    expect(
      clientBuildInfo(config, { ...build, consumer: 'server' }),
    ).toMatchObject({
      enabled: true,
      buildId: 'abc',
      manifestUrl: '/manifest.webmanifest',
      appleTouchIconUrl: '/any.png',
    });
  });

  it('is off while serving unless dev is on', () => {
    const serve = { serving: true, consumer: 'server', buildId: null } as const;
    expect(clientBuildInfo(config, serve)).toMatchObject({
      enabled: false,
      buildId: null,
    });
    const dev = resolvePwaConfig({ dev: true });
    expect(clientBuildInfo(dev, serve)).toMatchObject({
      enabled: true,
      buildId: 'dev',
      manifestUrl: null,
    });
  });

  it('is off for the Kill Switch', () => {
    const off = resolvePwaConfig({ enabled: false });
    expect(
      clientBuildInfo(off, { serving: false, consumer: 'server', buildId }),
    ).toMatchObject({ enabled: false, buildId: null });
  });
});

describe('assertAfterStart', () => {
  const start = { name: 'tanstack-start-core:post-build' };
  const own = { name: 'pwa-toolkit:build' };
  it('throws when pwa() comes before tanstackStart()', () => {
    expect(() => assertAfterStart([own, start], own.name)).toThrow(/after/);
    expect(() => assertAfterStart([start, own], own.name)).not.toThrow();
    expect(() => assertAfterStart([own], own.name)).not.toThrow();
  });
});
