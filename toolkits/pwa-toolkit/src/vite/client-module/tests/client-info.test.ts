import { describe, expect, it } from 'vitest';
import { BuildId } from '../../../shared/build/index.js';
import { resolvePwaConfig } from '../../../shared/config/index.js';
import { clientBuildInfo } from '../client-info.js';

const buildId = BuildId.make('abc');
const version = { commit: 'abc1234', builtAt: '2026-09-27T10:00:00.000Z' };

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
    const build = { serving: false, buildId, version };
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
      clientBuildInfo(off, {
        serving: false,
        consumer: 'server',
        buildId,
        version,
      }),
    ).toMatchObject({ enabled: false, buildId: null });
  });
});
