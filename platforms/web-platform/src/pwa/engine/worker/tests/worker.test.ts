import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { describe, expect, it } from 'vitest';
import {
  BuildId,
  pagesCacheName,
  precacheCacheName,
  runtimeCacheName,
} from '../../shared/build/index.js';
import {
  type PwaOptions,
  resolvePwaConfig,
  type WorkerBuildInfo,
  workerConfigOf,
} from '../../shared/config/index.js';
import { makeCommand } from '../../shared/commands/index.js';
import type { StrategyRule } from '../../shared/strategy/index.js';
import { WorkerHost } from '../../shared/worker-host/index.js';
import { makeFakeGlobal, settle, sleep, text } from './fake-global.js';
import { startServiceWorker } from '../worker.js';

const BUILD = BuildId.make('b2');
const PRECACHE = precacheCacheName(BUILD);
const SAVED = pagesCacheName(BUILD);

/** What Kabuki Start answers at `/_kabuki/pages`: one page of each kind. */
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
  options: {
    active?: boolean;
    waiting?: boolean;
    layer?: Layer.Layer<never, never, WorkerHost>;
  } = {},
) => {
  const fake = makeFakeGlobal({
    active: options.active ?? false,
    waiting: options.waiting ?? false,
  });
  startServiceWorker(
    fake.global,
    info,
    options.layer === undefined ? {} : { layer: options.layer },
  );
  return fake;
};

/** This build installed: its asset, and what Start said of its pages. */
const withPrecache = (fake: ReturnType<typeof makeFakeGlobal>) =>
  fake.caches.seed(PRECACHE, {
    '/assets/app.js': 'app-js',
    '/_kabuki/pages': JSON.stringify(PAGES),
    '/_kabuki/shell': 'shell',
    '/': 'home',
  });

/** Start's answers as the network gives them: its Pages, and each path's body. */
const startNetwork = (request: Request) =>
  new URL(request.url).pathname === '/_kabuki/pages'
    ? Response.json(PAGES)
    : new Response(`body:${new URL(request.url).pathname}`);

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
  it("saves the assets, Start's Pages, the App Shell and static pages without params, then skips waiting", async () => {
    const fake = start();
    fake.setNetwork(startNetwork);
    await settle(fake.dispatch('install'));
    expect(fake.caches.urls(PRECACHE).sort()).toEqual([
      '/',
      '/_kabuki/pages',
      '/_kabuki/shell',
      '/assets/app.js',
    ]);
    expect(fake.requests.every((r) => r.init?.cache === 'reload')).toBe(true);
    expect(fake.calls.skipWaiting).toBe(1);
  });

  it('installs with the assets alone when Start answers no Pages', async () => {
    const fake = start();
    fake.setNetwork((request) =>
      request.url.endsWith('/_kabuki/pages')
        ? new Response('', { status: 404 })
        : new Response('ok'),
    );
    await settle(fake.dispatch('install'));
    expect(fake.caches.urls(PRECACHE)).toEqual(['/assets/app.js']);
    expect(fake.calls.skipWaiting).toBe(1);
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

  it('leaves a static page that fails to download to the network', async () => {
    const fake = start();
    fake.setNetwork((request) =>
      new URL(request.url).pathname === '/'
        ? new Response('', { status: 500 })
        : startNetwork(request),
    );
    await settle(fake.dispatch('install'));
    expect(fake.caches.urls(PRECACHE)).not.toContain('/');
    expect(fake.calls.skipWaiting).toBe(1);
  });
});

describe('activate', () => {
  it('deletes other Precaches and orphaned Runtime Caches, then claims clients', async () => {
    const fake = start();
    const images = runtimeCacheName('images');
    fake.caches.seed(precacheCacheName(BuildId.make('b1')), { '/a': 'old' });
    fake.caches.seed(PRECACHE, { '/a': 'new' });
    fake.caches.seed(images, { '/i.png': 'img' });
    fake.caches.seed(runtimeCacheName('gone'), { '/x': 'x' });
    fake.caches.seed('someone-else', { '/y': 'y' });
    await settle(fake.dispatch('activate'));
    expect([...fake.caches.caches.keys()].sort()).toEqual(
      [PRECACHE, images, 'someone-else'].sort(),
    );
    expect(fake.calls.claim).toBe(1);
  });

  it("keeps only this build's saved pages", async () => {
    const oldPages = pagesCacheName(BuildId.make('b1'));
    const fake = start();
    fake.caches.seed(oldPages, { '/feed': 'old' });
    fake.caches.seed(SAVED, { '/feed': 'new' });
    await settle(fake.dispatch('activate'));
    expect([...fake.caches.caches.keys()]).toEqual([SAVED]);
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
  describe('a dynamic page', () => {
    it('is the network when it answers in time, and kept', async () => {
      const fake = start();
      withPrecache(fake);
      fake.setNetwork(() => new Response('fresh'));
      const first = fake.fetchEvent('/feed', { mode: 'navigate' });
      expect(await text(first)).toBe('fresh');
      await settle(first);
      fake.setNetwork(offline);
      expect(await navigate(fake, '/feed')).toBe('fresh');
    });

    it('is the App Shell offline when it was never kept', async () => {
      const fake = start();
      withPrecache(fake);
      fake.setNetwork(offline);
      expect(await navigate(fake, '/feed')).toBe('shell');
    });

    it('falls back after networkTimeoutMs', async () => {
      const fake = start(build({ navigation: { networkTimeoutMs: 20 } }));
      withPrecache(fake);
      fake.setNetwork(() => sleep(200).then(() => new Response('late')));
      expect(await navigate(fake, '/feed')).toBe('shell');
    });

    it('waits for a slow network when there is nothing to fall back to', async () => {
      const fake = start(build({ navigation: { networkTimeoutMs: 10 } }));
      fake.setNetwork(() => sleep(40).then(() => new Response('late')));
      expect(await navigate(fake, '/feed')).toBe('late');
    });
  });

  describe('a static page', () => {
    it('is the precached copy, without the network', async () => {
      const fake = start();
      withPrecache(fake);
      fake.setNetwork(() => new Response('fresh'));
      expect(await navigate(fake, '/')).toBe('home');
      expect(fake.requests).toEqual([]);
    });

    it('with params is fetched once, then kept', async () => {
      const fake = start();
      withPrecache(fake);
      fake.setNetwork(() => new Response('post'));
      const first = fake.fetchEvent('/blog/hello', { mode: 'navigate' });
      expect(await text(first)).toBe('post');
      await settle(first);
      fake.setNetwork(() => new Response('newer'));
      expect(await navigate(fake, '/blog/hello')).toBe('post');
      fake.setNetwork(offline);
      expect(await navigate(fake, '/blog/other')).toBe('shell');
    });
  });

  describe('a client page', () => {
    it('is the App Shell, without the network', async () => {
      const fake = start();
      withPrecache(fake);
      fake.setNetwork(() => new Response('drawn'));
      expect(await navigate(fake, '/inbox?tab=1')).toBe('shell');
      expect(fake.requests).toEqual([]);
    });
  });

  it('treats a page Start did not name, or every page with no Pages, as dynamic', async () => {
    const fake = start();
    withPrecache(fake);
    fake.setNetwork(() => new Response('fresh'));
    expect(await navigate(fake, '/nowhere')).toBe('fresh');

    const bare = start();
    bare.caches.seed(PRECACHE, { '/assets/app.js': 'app-js' });
    bare.setNetwork(() => new Response('drawn'));
    expect(await navigate(bare, '/inbox')).toBe('drawn');
  });

  it('never handles denylisted paths', () => {
    const fake = start(build({ navigation: { denylist: ['/admin'] } }));
    expect(
      fake.fetchEvent('/admin/x', { mode: 'navigate' }).response,
    ).toBeUndefined();
  });

  it("answers with this build's copy, else its App Shell, without the network while an update waits", async () => {
    const fake = start(build(), { waiting: true });
    withPrecache(fake);
    fake.caches.seed(SAVED, { '/feed': 'feed-v1' });
    fake.setNetwork(() => new Response('newer-build'));
    expect(await navigate(fake, '/feed')).toBe('feed-v1');
    expect(await navigate(fake, '/nowhere')).toBe('shell');
    expect(fake.requests).toEqual([]);
  });

  it('uses the network while an update waits when this build has nothing', async () => {
    const fake = start(build(), { waiting: true });
    fake.setNetwork(() => new Response('newer-build'));
    const event = fake.fetchEvent('/feed', { mode: 'navigate' });
    expect(await text(event)).toBe('newer-build');
    await settle(event);
    // Not kept: the page belongs to the waiting build.
    expect(fake.caches.caches.get(SAVED)?.entries.size ?? 0).toBe(0);
  });

  it('answers with a network error when nothing is available', async () => {
    const fake = start();
    const event = fake.fetchEvent('/feed', { mode: 'navigate' });
    expect((await event.response!).type).toBe('error');
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
        headers: { 'x-pwa-toolkit-cached-at': String(Date.now() - 120_000) },
      }),
      '/data/new': new Response('fresh', {
        headers: { 'x-pwa-toolkit-cached-at': String(Date.now()) },
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

describe('WorkerHost', () => {
  it('delivers messages sent before the layer subscribed, but not commands', async () => {
    const received: Array<unknown> = [];
    const layer = Layer.effectDiscard(
      Effect.gen(function* () {
        const host = yield* WorkerHost;
        received.push(host.buildId);
        yield* Effect.forkScoped(
          Stream.runForEach(host.messages, (event) =>
            Effect.sync(() => received.push(event.data)),
          ),
        );
      }),
    );
    const fake = makeFakeGlobal();
    startServiceWorker(fake.global, build(), { layer });
    const early = fake.dispatch('message', { data: { rpc: 1 }, ports: [] });
    fake.dispatch('message', {
      data: makeCommand('SKIP_WAITING'),
      ports: [],
    });
    expect(early.lifetimes).toHaveLength(1);
    await settle(early);
    fake.dispatch('message', { data: { rpc: 2 }, ports: [] });
    await sleep(10);
    expect(received).toEqual(['b2', { rpc: 1 }, { rpc: 2 }]);
  });
});
