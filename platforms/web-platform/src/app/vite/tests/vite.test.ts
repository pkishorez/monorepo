import { createServer } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Plugin } from 'vite';
import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { describe, expect, it } from 'vitest';
import { app } from '../index.ts';

const devtoolsPlugin = (devtools: string): Plugin => {
  const plugin = app({ name: 'App', platform: cloudflare(), devtools }).find(
    (one) => one.name === '@kestack/web-platform:devtools',
  );
  if (!plugin) throw new Error('no @kestack/web-platform:devtools plugin');
  return plugin;
};

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

  it('runs under vite dev only, not vite preview or a build', () => {
    const apply = devtoolsPlugin('http://127.0.0.1:9000').apply as (
      config: object,
      env: { command: string; isPreview?: boolean },
    ) => boolean;
    expect(apply({}, { command: 'serve', isPreview: false })).toBe(true);
    expect(apply({}, { command: 'serve', isPreview: true })).toBe(false);
    expect(apply({}, { command: 'build' })).toBe(false);
  });

  it("pipes only a Kabuki Session's socket to DevTools, under its path, and keeps it from the app's own upgrade listeners", async () => {
    const seen: Array<{ url?: string; host?: string }> = [];
    const target = createServer();
    target.on('upgrade', (request, socket) => {
      seen.push({ url: request.url, host: request.headers.host });
      socket.end(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nfrom-devtools',
      );
    });
    const site = createServer();
    // The app's Worker answers every upgrade too, with its 404 page.
    site.on('upgrade', (_request, socket) =>
      socket.end('HTTP/1.1 404 Not Found\r\n\r\nnot-found'),
    );
    await Promise.all(
      [target, site].map(
        (server) =>
          new Promise<void>((done) => server.listen(0, '127.0.0.1', done)),
      ),
    );
    const port = (server: typeof site) =>
      (server.address() as AddressInfo).port;
    const plugin = devtoolsPlugin(`http://127.0.0.1:${port(target)}/team/`);
    (plugin.configureServer as (server: unknown) => void)({ httpServer: site });

    const upgrade = (path: string) =>
      new Promise<string>((done) => {
        const client = connect(port(site), '127.0.0.1', () =>
          client.write(
            `GET ${path} HTTP/1.1\r\nHost: app.test\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`,
          ),
        );
        let got = '';
        client.on('data', (data) => void (got += data.toString()));
        client.on('close', () => done(got));
      });

    const dialed = await upgrade('/__devtools/kabuki/connect?name=a');
    expect(dialed).toContain('101 Switching Protocols');
    expect(dialed).not.toContain('not-found');
    expect(seen).toEqual([
      {
        url: '/team/kabuki/connect?name=a',
        host: `127.0.0.1:${port(target)}`,
      },
    ]);
    // DevTools' own API is never reachable through the site.
    expect(await upgrade('/__devtools/rpc')).toContain('not-found');
    expect(await upgrade('/__devtools/kabuki/connectx')).toContain('not-found');
    expect(seen).toHaveLength(1);
    await Promise.all(
      [target, site].map((server) => new Promise((done) => server.close(done))),
    );
  });

  it('proxies no DevTools with devtools: false', () => {
    const plugins = names({
      name: 'App',
      platform: cloudflare(),
      devtools: false,
    });
    expect(plugins).not.toContain('@kestack/web-platform:devtools');
  });
});
