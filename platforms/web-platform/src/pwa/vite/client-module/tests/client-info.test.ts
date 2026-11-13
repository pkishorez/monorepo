import { describe, expect, it } from 'vitest';
import { BuildId } from '../../../contract/build/index.js';
import { resolvePwaConfig } from '../../../contract/config/index.js';
import { clientBuildInfo } from '../client-info.js';

const buildId = BuildId.make('abc');
const version = { commit: 'abc1234', builtAt: '2026-09-27T10:00:00.000Z' };

describe('clientBuildInfo', () => {
  const config = resolvePwaConfig({
    name: 'x',
    manifest: {
      theme_color: '#000',
      icons: [
        { src: '/mask.png', type: 'image/png', purpose: 'maskable' },
        { src: '/any.png', type: 'image/png' },
      ],
    },
  });

  it('gives the Build ID to the server environment only', () => {
    const build = { serving: false, buildId, version };
    expect(
      clientBuildInfo(config, { ...build, consumer: 'client' }).buildId,
    ).toBeNull();
    expect(
      clientBuildInfo(config, { ...build, consumer: 'server' }),
    ).toMatchObject({
      enabled: true,
      buildId: 'abc',
      name: 'x',
      title: 'x',
      splash: false,
      manifestUrl: '/manifest.webmanifest',
      appleTouchIconUrl: '/any.png',
    });
  });

  it('gives the commit and build time to the server environment only', () => {
    const build = { serving: false, buildId, version };
    expect(
      clientBuildInfo(config, { ...build, consumer: 'client' }),
    ).toMatchObject({ builtAt: null, commit: null });
    expect(
      clientBuildInfo(config, { ...build, consumer: 'server' }),
    ).toMatchObject(version);
  });

  it('is off while serving unless dev is on', () => {
    const serve = {
      serving: true,
      consumer: 'server',
      buildId: null,
      version,
    } as const;
    expect(clientBuildInfo(config, serve)).toMatchObject({
      enabled: false,
      buildId: null,
    });
    const dev = resolvePwaConfig({ name: 'App', dev: true });
    expect(clientBuildInfo(dev, serve)).toMatchObject({
      enabled: true,
      buildId: 'dev',
      manifestUrl: '/manifest.webmanifest',
      appleTouchIconUrl: '/apple-touch-icon.png',
    });
  });

  it('titles the home-screen icon with the short name, and passes the Splash on', () => {
    const short = resolvePwaConfig({
      name: 'Code on touch',
      splash: true,
      manifest: { short_name: 'Code' },
    });
    expect(
      clientBuildInfo(short, {
        serving: false,
        consumer: 'client',
        buildId: null,
        version,
      }),
    ).toMatchObject({ name: 'Code on touch', title: 'Code', splash: true });
  });

  it('is off for the Kill Switch', () => {
    const off = resolvePwaConfig({ name: 'App', enabled: false });
    expect(
      clientBuildInfo(off, {
        serving: false,
        consumer: 'server',
        buildId,
        version,
      }),
    ).toMatchObject({ enabled: false, buildId: null });
  });
});
