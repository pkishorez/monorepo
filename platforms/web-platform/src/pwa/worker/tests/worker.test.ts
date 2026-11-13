import { describe, expect, it } from 'vitest';
import {
  BuildId,
  precacheCacheName,
  runtimeCacheName,
} from '../../contract/build/index.js';
import {
  type PwaOptions,
  resolvePwaConfig,
  type WorkerBuildInfo,
  workerConfigOf,
} from '../../contract/config/index.js';
import { makeCommand } from '../../contract/commands/index.js';
import type { StrategyRule } from '../../contract/config/strategy/index.js';
import { makeFakeGlobal, settle, sleep, text } from './fake-global.js';
import { startServiceWorker } from '../worker.js';

const BUILD = BuildId.make('b2');
const PRECACHE = precacheCacheName(BUILD);

/** What Kabuki Start answers at `/_kabuki/pages`. */
const PAGES = {
  build: 'k1',
  shell: '/_kabuki/shell',
  pages: [
    { name: 'Home', path: '/', params: false, render: 'static' },
    { name: 'Post', path: '/blog/:slug', params: true, render: 'static' },
    { name: 'Feed', path: '/feed', params: false, render: 'dynamic' },
    { name: 'Inbox', path: '/inbox', params: false, render: 'client' },
  ],
};

const build = (
  options: Omit<typeof PwaOptions.Type, 'name'> = {},
): WorkerBuildInfo => ({
  buildId: BUILD,
  precache: [{ url: '/assets/app.js', revision: 'a1' }],
  config: workerConfigOf(
    resolvePwaConfig({ name: 'App', preset: 'app', ...options }),
  ),
});

const start = (
  info: WorkerBuildInfo = build(),
  options: { active?: boolean } = {},
) => {
  const fake = makeFakeGlobal({
    active: options.active ?? false,
  });
  startServiceWorker(fake.global, info);
  return fake;
};

/** This build installed: its asset and the App Shell. */
const withPrecache = (fake: ReturnType<typeof makeFakeGlobal>) =>
  fake.caches.seed(PRECACHE, {
    '/assets/app.js': 'app-js',
    '/_kabuki/shell': 'shell',
  });

/** Start's answers, each page drawn by the server build `drawnBy`. */
const drawn = (request: Request, drawnBy: string) =>
  new URL(request.url).pathname === '/_kabuki/pages'
    ? Response.json(PAGES)
    : new Response(`body:${new URL(request.url).pathname} ${drawnBy}`);

/** Start's answers as the network gives them: its Pages, and each path's body. */
const startNetwork = (request: Request) => drawn(request, PAGES.build);

/** The network, but `path` answers with an older deploy's copy the first `stale` times it is asked. */
const staleAt = (path: string, stale: number) => {
  let asked = 0;
  return (request: Request) =>
    new URL(request.url).pathname === path && asked++ < stale
      ? drawn(request, 'k0')
      : startNetwork(request);
};

const navigate = (fake: ReturnType<typeof makeFakeGlobal>, path: string) =>
  text(fake.fetchEvent(path, { mode: 'navigate' }));

const offline = () => Promise.reject(new TypeError('offline'));

const rule = (fields: Partial<StrategyRule>): StrategyRule => ({
  match: { origin: 'same-origin', pathPrefix: '/data/' },
  strategy: 'cache-first',
  cacheName: 'data',
  ...fields,
});

describe('listeners', () => {
  it('registers every listener synchronously', () => {
    const fake = start();
    expect([...fake.listeners.keys()].sort()).toEqual([
      'activate',
      'fetch',
      'install',
      'message',
    ]);
  });
});

describe('install', () => {
  it('saves the assets and the App Shell, and no other page, then skips waiting', async () => {
    const fake = start();
    fake.setNetwork(startNetwork);
    await settle(fake.dispatch('install'));
    expect(fake.caches.urls(PRECACHE).sort()).toEqual([
      '/_kabuki/shell',
      '/assets/app.js',
    ]);
    expect(fake.requests.every((r) => r.init?.cache === 'reload')).toBe(true);
    expect(fake.calls.skipWaiting).toBe(1);
  });

  it("asks once more, past every cache, for an App Shell an older deploy drew, and saves Start's own", async () => {
    const fake = start();
    fake.setNetwork(staleAt('/_kabuki/shell', 1));
    await settle(fake.dispatch('install'));
    const saved = await (
      await fake.caches.open(PRECACHE)
    ).match('/_kabuki/shell');
    expect(await saved?.text()).toBe('body:/_kabuki/shell k1');
    const asked = fake.requests.filter((r) => r.url === '/_kabuki/shell');
    expect(asked.map((r) => r.init?.cache)).toEqual(['reload', 'no-store']);
  });

  it('replaces an App Shell the last install of this Build ID saved from an older deploy', async () => {
    const fake = start();
    fake.caches.seed(PRECACHE, { '/_kabuki/shell': 'body:/_kabuki/shell k0' });
    fake.setNetwork(startNetwork);
    await settle(fake.dispatch('install'));
    const saved = await (
      await fake.caches.open(PRECACHE)
    ).match('/_kabuki/shell');
    expect(await saved?.text()).toBe('body:/_kabuki/shell k1');
  });

  it('keeps an App Shell this deploy already drew', async () => {
    const fake = start();
    fake.caches.seed(PRECACHE, { '/_kabuki/shell': 'body:/_kabuki/shell k1' });
    fake.setNetwork(startNetwork);
    await settle(fake.dispatch('install'));
    expect(fake.requests.filter((r) => r.url === '/_kabuki/shell')).toEqual([]);
  });

  it("fails install, deleting it, when the App Shell is still an older deploy's", async () => {
    const fake = start();
    fake.caches.seed(PRECACHE, { '/_kabuki/shell': 'body:/_kabuki/shell k0' });
    fake.setNetwork(staleAt('/_kabuki/shell', 2));
    const event = fake.dispatch('install');
    await expect(Promise.all(event.lifetimes)).rejects.toThrow(
      '/_kabuki/shell',
    );
    expect(fake.calls.skipWaiting).toBe(0);
    expect(fake.caches.urls(PRECACHE)).not.toContain('/_kabuki/shell');
  });

  it('installs with the assets alone when Start answers no Pages, or not as Start does', async () => {
    for (const answer of [
      new Response('', { status: 404 }),
      Response.json({ hello: 'world' }),
    ]) {
      const fake = start();
      fake.setNetwork((request) =>
        request.url.endsWith('/_kabuki/pages')
          ? answer.clone()
          : new Response('ok'),
      );
      await settle(fake.dispatch('install'));
      expect(fake.caches.urls(PRECACHE)).toEqual(['/assets/app.js']);
      expect(fake.calls.skipWaiting).toBe(1);
    }
  });

  it('fails install when Start cannot be reached or its server fails, to try again', async () => {
    for (const answer of [
      offline,
      () => Promise.resolve(new Response('', { status: 503 })),
    ]) {
      const fake = start();
      fake.setNetwork((request) =>
        request.url.endsWith('/_kabuki/pages')
          ? answer()
          : startNetwork(request),
      );
      const event = fake.dispatch('install');
      await expect(Promise.all(event.lifetimes)).rejects.toThrow();
      expect(fake.calls.skipWaiting).toBe(0);
    }
  });

  it('waits for SKIP_WAITING when an older version is active', async () => {
    const fake = start(build(), { active: true });
    fake.setNetwork(startNetwork);
    await settle(fake.dispatch('install'));
    expect(fake.calls.skipWaiting).toBe(0);
  });

  it('fails install when an asset or the App Shell fails to download', async () => {
    for (const failing of ['/assets/app.js', '/_kabuki/shell']) {
      const fake = start();
      fake.setNetwork((request) =>
        request.url.endsWith(failing)
          ? new Response('', { status: 500 })
          : startNetwork(request),
      );
      const event = fake.dispatch('install');
      await expect(Promise.all(event.lifetimes)).rejects.toThrow(failing);
      expect(fake.calls.skipWaiting).toBe(0);
    }
  });
});

describe('activate', () => {
  it('deletes other Precaches, pages an older worker saved and orphaned Runtime Caches, then claims clients', async () => {
    const fake = start();
    const images = runtimeCacheName('images');
    fake.caches.seed(precacheCacheName(BuildId.make('b1')), { '/a': 'old' });
    fake.caches.seed(PRECACHE, { '/a': 'new' });
    fake.caches.seed(images, { '/i.png': 'img' });
    fake.caches.seed(runtimeCacheName('pages:b1'), { '/feed': 'old' });
    fake.caches.seed(runtimeCacheName('gone'), { '/x': 'x' });
    fake.caches.seed('someone-else', { '/y': 'y' });
    await settle(fake.dispatch('activate'));
    expect([...fake.caches.caches.keys()].sort()).toEqual(
      [PRECACHE, images, 'someone-else'].sort(),
    );
    expect(fake.calls.claim).toBe(1);
  });

  it('deletes every cache under the former name, pwa-toolkit', async () => {
    const fake = start();
    fake.caches.seed(PRECACHE, { '/a': 'new' });
    fake.caches.seed('pwa-toolkit:precache:b1', { '/a': 'old' });
    fake.caches.seed('pwa-toolkit:runtime:images', { '/i.png': 'img' });
    await settle(fake.dispatch('activate'));
    expect([...fake.caches.caches.keys()]).toEqual([PRECACHE]);
  });
});

describe('fetch routing', () => {
  it('leaves non-GET, neverCache and unmatched requests to the browser', () => {
    const fake = start();
    expect(
      fake.fetchEvent('/assets/app.js', { method: 'POST' }).response,
    ).toBeUndefined();
    expect(fake.fetchEvent('/api/auth/session').response).toBeUndefined();
    expect(
      fake.fetchEvent('/api/auth/login', { mode: 'navigate' }).response,
    ).toBeUndefined();
    expect(fake.fetchEvent('/api/other').response).toBeUndefined();
  });

  it('serves precached assets from the Precache', async () => {
    const fake = start();
    withPrecache(fake);
    expect(await text(fake.fetchEvent('/assets/app.js'))).toBe('app-js');
    expect(fake.requests).toEqual([]);
  });
});

describe('navigation', () => {
  it('answers every page with the App Shell, without the network', async () => {
    const fake = start();
    withPrecache(fake);
    fake.setNetwork(() => new Response('drawn'));
    for (const path of [
      '/',
      '/feed',
      '/blog/hello',
      '/inbox?tab=1',
      '/nowhere',
    ])
      expect(await navigate(fake, path)).toBe('shell');
    expect(fake.requests).toEqual([]);
  });

  it('answers with the App Shell offline', async () => {
    const fake = start();
    withPrecache(fake);
    fake.setNetwork(offline);
    expect(await navigate(fake, '/feed')).toBe('shell');
  });

  it("stays on this build's App Shell while an update waits", async () => {
    const fake = start(build(), { active: true });
    withPrecache(fake);
    fake.setNetwork(() => new Response('newer-build'));
    expect(await navigate(fake, '/feed')).toBe('shell');
    expect(fake.requests).toEqual([]);
  });

  it('is the network with no App Shell, as for an app not on Start', async () => {
    const fake = start();
    fake.caches.seed(PRECACHE, { '/assets/app.js': 'app-js' });
    fake.setNetwork(() => new Response('drawn'));
    expect(await navigate(fake, '/inbox')).toBe('drawn');
  });

  it('answers with a network error when nothing is available', async () => {
    const fake = start();
    const event = fake.fetchEvent('/feed', { mode: 'navigate' });
    expect((await event.response!).type).toBe('error');
  });

  it("leaves files, Start's own addresses and denylisted paths to the browser", () => {
    const fake = start(build({ navigation: { denylist: ['/admin'] } }));
    withPrecache(fake);
    for (const path of [
      '/og.png',
      '/files/report.pdf',
      '/_kabuki/pages',
      '/_kabuki/shell',
      '/admin/x',
    ])
      expect(
        fake.fetchEvent(path, { mode: 'navigate' }).response,
      ).toBeUndefined();
  });
});

describe('Runtime Cache', () => {
  const DATA = runtimeCacheName('data');
  const counter = (fake: ReturnType<typeof makeFakeGlobal>) => {
    let n = 0;
    fake.setNetwork(() => new Response(`v${++n}`));
  };

  it('cache-first fetches once', async () => {
    const fake = start(build({ strategies: [rule({})] }));
    counter(fake);
    const first = fake.fetchEvent('/data/a');
    expect(await text(first)).toBe('v1');
    await settle(first);
    expect(await text(fake.fetchEvent('/data/a'))).toBe('v1');
    expect(fake.requests).toHaveLength(1);
  });

  it('matches preset rules by destination', async () => {
    const fake = start();
    counter(fake);
    const event = fake.fetchEvent('/logo.png', { destination: 'image' });
    expect(await text(event)).toBe('v1');
    await settle(event);
    expect(fake.caches.urls(runtimeCacheName('images'))).toEqual(['/logo.png']);
  });

  it('network-first falls back to the cache on failure and timeout', async () => {
    const fake = start(
      build({
        strategies: [rule({ strategy: 'network-first', networkTimeoutMs: 20 })],
      }),
    );
    counter(fake);
    const first = fake.fetchEvent('/data/a');
    expect(await text(first)).toBe('v1');
    await settle(first);
    fake.setNetwork(() => Promise.reject(new TypeError('offline')));
    expect(await text(fake.fetchEvent('/data/a'))).toBe('v1');
    fake.setNetwork(() => sleep(100).then(() => new Response('late')));
    const slow = fake.fetchEvent('/data/a');
    expect(await text(slow)).toBe('v1');
    await settle(slow);
    expect(
      await (
        await fake.caches.open(DATA)
      )
        .match('/data/a')
        .then((r) => r?.text()),
    ).toBe('late');
  });

  it('stale-while-revalidate answers from the cache and refreshes it', async () => {
    const fake = start(
      build({ strategies: [rule({ strategy: 'stale-while-revalidate' })] }),
    );
    counter(fake);
    const first = fake.fetchEvent('/data/a');
    expect(await text(first)).toBe('v1');
    await settle(first);
    const second = fake.fetchEvent('/data/a');
    expect(await text(second)).toBe('v1');
    await settle(second);
    expect(await text(fake.fetchEvent('/data/a'))).toBe('v2');
  });

  it('network-only never caches; cache-only never fetches', async () => {
    const fake = start(
      build({
        strategies: [
          rule({
            strategy: 'network-only',
            match: { origin: 'same-origin', pathPrefix: '/net/' },
          }),
          rule({ strategy: 'cache-only', cacheName: 'fixed' }),
        ],
      }),
    );
    counter(fake);
    const net = fake.fetchEvent('/net/a');
    expect(await text(net)).toBe('v1');
    await settle(net);
    expect(fake.caches.caches.size).toBe(0);
    expect((await fake.fetchEvent('/data/a').response!).type).toBe('error');
    fake.caches.seed(runtimeCacheName('fixed'), { '/data/a': 'saved' });
    expect(await text(fake.fetchEvent('/data/a'))).toBe('saved');
    expect(fake.requests).toHaveLength(1);
  });

  it('does not save failed responses', async () => {
    const fake = start(build({ strategies: [rule({})] }));
    fake.setNetwork(() => new Response('boom', { status: 500 }));
    const event = fake.fetchEvent('/data/a');
    expect((await event.response!).status).toBe(500);
    await settle(event);
    expect(fake.caches.urls(DATA)).toEqual([]);
  });

  it('trims to maxEntries, oldest first', async () => {
    const fake = start(build({ strategies: [rule({ maxEntries: 2 })] }));
    counter(fake);
    for (const path of ['/data/a', '/data/b', '/data/c'])
      await settle(fake.fetchEvent(path));
    expect(fake.caches.urls(DATA)).toEqual(['/data/b', '/data/c']);
  });

  it('treats entries older than maxAgeSeconds as missing', async () => {
    const fake = start(build({ strategies: [rule({ maxAgeSeconds: 60 })] }));
    counter(fake);
    fake.caches.seed(DATA, {
      '/data/old': new Response('stale', {
        headers: { 'x-web-platform-cached-at': String(Date.now() - 120_000) },
      }),
      '/data/new': new Response('fresh', {
        headers: { 'x-web-platform-cached-at': String(Date.now()) },
      }),
    });
    expect(await text(fake.fetchEvent('/data/old'))).toBe('v1');
    expect(await text(fake.fetchEvent('/data/new'))).toBe('fresh');
  });
});

describe('commands', () => {
  const send = (fake: ReturnType<typeof makeFakeGlobal>, data: unknown) => {
    const replies: Array<unknown> = [];
    const event = fake.dispatch('message', {
      data,
      ports: [{ postMessage: (reply: unknown) => replies.push(reply) }],
    });
    return settle(event).then(() => replies);
  };

  it('answers SKIP_WAITING on the port', async () => {
    const fake = start();
    expect(await send(fake, makeCommand('SKIP_WAITING'))).toEqual([
      { __pwaToolkit: 1, type: 'DONE' },
    ]);
    expect(fake.calls.skipWaiting).toBe(1);
  });

  it('ignores unknown types and foreign messages', async () => {
    const fake = start();
    expect(await send(fake, { __pwaToolkit: 1, type: 'GET_BUILD_ID' })).toEqual(
      [],
    );
    expect(await send(fake, { __pwaToolkit: 2, type: 'SKIP_WAITING' })).toEqual(
      [],
    );
    expect(await send(fake, { hello: 'world' })).toEqual([]);
  });
});
