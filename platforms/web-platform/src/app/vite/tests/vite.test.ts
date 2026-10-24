import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { describe, expect, it } from 'vitest';
import { app } from '../index.ts';

const names = (options: Parameters<typeof app>[0]) =>
  app(options).map((plugin) => plugin.name);

describe('app()', () => {
  it('is Tailwind, React, Start and the PWA, with the Web Platform bundled for the server', () => {
    const plugins = names({ name: 'App', platform: cloudflare() });
    expect(plugins).toContain('@kestack/web-platform:app');
    expect(plugins.some((name) => name.startsWith('pwa-toolkit:'))).toBe(true);
    expect(plugins).not.toContain('pwa-toolkit:off');
  });

  it('is no PWA with pwa: false', () => {
    const plugins = names({ name: 'App', platform: cloudflare(), pwa: false });
    expect(plugins.filter((name) => name.startsWith('pwa-toolkit:'))).toEqual([
      'pwa-toolkit:off',
    ]);
  });

  it('bundles the Web Platform for the server and gives workerd debug’s browser build', () => {
    const own = app({ name: 'App', platform: cloudflare() }).find(
      (plugin) => plugin.name === '@kestack/web-platform:app',
    );
    if (!own) throw new Error('no @kestack/web-platform:app plugin');
    const config = (own.config as () => unknown)();
    expect(config).toEqual({
      ssr: { noExternal: ['@kestack/web-platform'] },
      resolve: { alias: { debug: 'debug/src/browser.js' } },
    });
  });
});
