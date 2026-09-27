import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { describe, expect, it } from 'vitest';
import {
  BuildId,
  pagesCacheName,
  precacheCacheName,
  runtimeCacheName,
} from '../../domain/build/index.js';
import {
  resolvePwaConfig,
  type WorkerBuildInfo,
  workerConfigOf,
} from '../../domain/config/index.js';
import { makeControlRequest } from '../../domain/control-channel/index.js';
import type { RuntimeCacheRule } from '../../domain/runtime-cache/index.js';
import { WorkerHost } from '../../domain/worker-host/index.js';
import { makeFakeGlobal, settle, sleep, text } from './fake-global.js';
import { startServiceWorker } from '../worker.js';

const BUILD = BuildId.make('b2');
const PRECACHE = precacheCacheName(BUILD);

const build = (
  options: Parameters<typeof resolvePwaConfig>[0] = {},
): WorkerBuildInfo => ({
  buildId: BUILD,
  precache: [
    { url: '/assets/app.js', revision: 'a1' },
    { url: '/_shell', revision: 's1' },
    { url: '/offline', revision: 'o1' },
  ],
  config: workerConfigOf(resolvePwaConfig({ preset: 'app', ...options })),
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

const withPrecache = (fake: ReturnType<typeof makeFakeGlobal>) =>
  fake.caches.seed(PRECACHE, {
    '/assets/app.js': 'app-js',
    '/_shell': 'shell',
    '/offline': 'offline',
  });

const rule = (fields: Partial<RuntimeCacheRule>): RuntimeCacheRule => ({
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
  it('downloads every entry bypassing the HTTP cache, then skips waiting on first install', async () => {
    const fake = start();
    fake.setNetwork(
      (request) => new Response(`body:${new URL(request.url).pathname}`),
    );
    await settle(fake.dispatch('install'));
    expect(fake.caches.urls(PRECACHE).sort()).toEqual([
      '/_shell',
      '/assets/app.js',
      '/offline',
    ]);
    expect(fake.requests.every((r) => r.init?.cache === 'reload')).toBe(true);
    expect(fake.calls.skipWaiting).toBe(1);
  });

  it('waits for SKIP_WAITING when an older version is active', async () => {
    const fake = start(build(), { active: true });
    fake.setNetwork(() => new Response('ok'));
    await settle(fake.dispatch('install'));
    expect(fake.calls.skipWaiting).toBe(0);
  });

  it('fails install when any download fails', async () => {
    const fake = start();
    fake.setNetwork((request) =>
      request.url.endsWith('/offline')
        ? new Response('', { status: 404 })
        : new Response('ok'),
    );
    const event = fake.dispatch('install');
    await expect(Promise.all(event.lifetimes)).rejects.toThrow(/offline/);
    expect(fake.calls.skipWaiting).toBe(0);
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

  it("keeps only this build's saved pages with cachePages, and none without", async () => {
    const oldPages = pagesCacheName(BuildId.make('b1'));
    const pages = pagesCacheName(BUILD);
    const content = start(build({ navigation: { cachePages: true } }));
    content.caches.seed(oldPages, { '/page': 'old' });
    content.caches.seed(pages, { '/page': 'new' });
    await settle(content.dispatch('activate'));
    expect([...content.caches.caches.keys()]).toEqual([pages]);

    const app = start();
    app.caches.seed(pages, { '/page': 'new' });
    await settle(app.dispatch('activate'));
    expect([...app.caches.caches.keys()]).toEqual([]);
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
  it('uses the network when it answers in time', async () => {
    const fake = start();
    withPrecache(fake);
    fake.setNetwork(() => new Response('fresh'));
    expect(await text(fake.fetchEvent('/page', { mode: 'navigate' }))).toBe(
      'fresh',
    );
  });

  it('falls back to the App Shell, then the Offline Fallback', async () => {
    const fake = start();
    withPrecache(fake);
    expect(await text(fake.fetchEvent('/page', { mode: 'navigate' }))).toBe(
      'shell',
    );

    const noShell = start(build({ navigation: { shell: false } }));
    withPrecache(noShell);
    const response = await noShell.fetchEvent('/page?x=1', {
      mode: 'navigate',
    }).response;
    expect(response?.status).toBe(302);
    const location = new URL(response?.headers.get('location') ?? '');
    expect(location.pathname).toBe('/offline');
    expect(location.searchParams.get('from')).toBe('/page?x=1');
  });

  it('serves the Offline Fallback body when the navigation is for it', async () => {
    const fake = start(build({ navigation: { shell: false } }));
    withPrecache(fake);
    expect(
      await text(
        fake.fetchEvent('/offline?from=%2Fpage', { mode: 'navigate' }),
      ),
    ).toBe('offline');
  });

  it('does not redirect when the Offline Fallback is missing', async () => {
    const fake = start(build({ navigation: { shell: false } }));
    const response = await fake.fetchEvent('/page', { mode: 'navigate' })
      .response;
    expect(response?.type).toBe('error');
  });

  it('falls back after networkTimeoutMs', async () => {
    const fake = start(build({ navigation: { networkTimeoutMs: 20 } }));
    withPrecache(fake);
    fake.setNetwork(() => sleep(200).then(() => new Response('late')));
    expect(await text(fake.fetchEvent('/page', { mode: 'navigate' }))).toBe(
      'shell',
    );
  });

  it('waits for a slow network when there is nothing to fall back to', async () => {
    const fake = start(build({ navigation: { networkTimeoutMs: 10 } }));
    fake.setNetwork(() => sleep(40).then(() => new Response('late')));
    expect(await text(fake.fetchEvent('/page', { mode: 'navigate' }))).toBe(
      'late',
    );
  });

  it('never handles denylisted paths', () => {
    const fake = start(build({ navigation: { denylist: ['/admin'] } }));
    expect(
      fake.fetchEvent('/admin/x', { mode: 'navigate' }).response,
    ).toBeUndefined();
  });

  it('saves and serves pages only with cachePages', async () => {
    const fake = start(build({ navigation: { cachePages: true } }));
    withPrecache(fake);
    fake.setNetwork(() => new Response('page-v1'));
    const first = fake.fetchEvent('/page', { mode: 'navigate' });
    expect(await text(first)).toBe('page-v1');
    await settle(first);
    fake.setNetwork(() => Promise.reject(new TypeError('offline')));
    expect(await text(fake.fetchEvent('/page', { mode: 'navigate' }))).toBe(
      'page-v1',
    );
    expect(await text(fake.fetchEvent('/other', { mode: 'navigate' }))).toBe(
      'shell',
    );
  });

  it('serves the App Shell without the network while an update waits', async () => {
    const fake = start(build(), { waiting: true });
    withPrecache(fake);
    fake.setNetwork(() => new Response('newer-build'));
    expect(await text(fake.fetchEvent('/page', { mode: 'navigate' }))).toBe(
      'shell',
    );
    expect(fake.requests).toEqual([]);
  });

  it('uses the network while an update waits when the App Shell is off or missing', async () => {
    const noShell = start(build({ navigation: { shell: false } }), {
      waiting: true,
    });
    withPrecache(noShell);
    noShell.setNetwork(() => new Response('newer-build'));
    expect(await text(noShell.fetchEvent('/page', { mode: 'navigate' }))).toBe(
      'newer-build',
    );

    const missing = start(build(), { waiting: true });
    missing.setNetwork(() => new Response('newer-build'));
    expect(await text(missing.fetchEvent('/page', { mode: 'navigate' }))).toBe(
      'newer-build',
    );
  });

  it("doesn't save pages while an update waits", async () => {
    const fake = start(
      build({ navigation: { cachePages: true, shell: false } }),
      { waiting: true },
    );
    withPrecache(fake);
    fake.setNetwork(() => new Response('newer-build'));
    const event = fake.fetchEvent('/page', { mode: 'navigate' });
    expect(await text(event)).toBe('newer-build');
    await settle(event);
    expect(
      fake.caches.caches.get(pagesCacheName(BUILD))?.entries.size ?? 0,
    ).toBe(0);
  });

  it('answers with a network error when nothing is available', async () => {
    const fake = start();
    const event = fake.fetchEvent('/page', { mode: 'navigate' });
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
    const fake = start(build({ runtimeCache: [rule({})] }));
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
        runtimeCache: [
          rule({ strategy: 'network-first', networkTimeoutMs: 20 }),
        ],
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
      build({ runtimeCache: [rule({ strategy: 'stale-while-revalidate' })] }),
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
        runtimeCache: [
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
    const fake = start(build({ runtimeCache: [rule({})] }));
    fake.setNetwork(() => new Response('boom', { status: 500 }));
    const event = fake.fetchEvent('/data/a');
    expect((await event.response!).status).toBe(500);
    await settle(event);
    expect(fake.caches.urls(DATA)).toEqual([]);
  });

  it('trims to maxEntries, oldest first', async () => {
    const fake = start(build({ runtimeCache: [rule({ maxEntries: 2 })] }));
    counter(fake);
    for (const path of ['/data/a', '/data/b', '/data/c'])
      await settle(fake.fetchEvent(path));
    expect(fake.caches.urls(DATA)).toEqual(['/data/b', '/data/c']);
  });

  it('treats entries older than maxAgeSeconds as missing', async () => {
    const fake = start(build({ runtimeCache: [rule({ maxAgeSeconds: 60 })] }));
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

describe('Control Channel', () => {
  const send = (fake: ReturnType<typeof makeFakeGlobal>, data: unknown) => {
    const replies: Array<unknown> = [];
    const event = fake.dispatch('message', {
      data,
      ports: [{ postMessage: (reply: unknown) => replies.push(reply) }],
    });
    return settle(event).then(() => replies);
  };

  it('answers GET_BUILD_ID, SKIP_WAITING and CLEAR_RUNTIME_CACHE on the port', async () => {
    const fake = start();
    fake.caches.seed(PRECACHE, { '/a': 'a' });
    fake.caches.seed(runtimeCacheName('images'), { '/i.png': 'i' });
    expect(await send(fake, makeControlRequest('GET_BUILD_ID'))).toEqual([
      { __pwaToolkit: 1, type: 'BUILD_ID', buildId: 'b2' },
    ]);
    expect(await send(fake, makeControlRequest('SKIP_WAITING'))).toEqual([
      { __pwaToolkit: 1, type: 'DONE' },
    ]);
    expect(fake.calls.skipWaiting).toBe(1);
    expect(await send(fake, makeControlRequest('CLEAR_RUNTIME_CACHE'))).toEqual(
      [{ __pwaToolkit: 1, type: 'DONE' }],
    );
    expect([...fake.caches.caches.keys()]).toEqual([PRECACHE]);
  });

  it('ignores unknown types and foreign messages', async () => {
    const fake = start();
    expect(await send(fake, { __pwaToolkit: 1, type: 'NOPE' })).toEqual([]);
    expect(await send(fake, { __pwaToolkit: 2, type: 'GET_BUILD_ID' })).toEqual(
      [],
    );
    expect(await send(fake, { hello: 'world' })).toEqual([]);
  });
});

describe('WorkerHost', () => {
  it('delivers messages sent before the layer subscribed, but not Control Channel traffic', async () => {
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
      data: makeControlRequest('GET_BUILD_ID'),
      ports: [],
    });
    expect(early.lifetimes).toHaveLength(1);
    await settle(early);
    fake.dispatch('message', { data: { rpc: 2 }, ports: [] });
    await sleep(10);
    expect(received).toEqual(['b2', { rpc: 1 }, { rpc: 2 }]);
  });
});
