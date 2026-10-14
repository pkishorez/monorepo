import { Effect, Layer } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Loading } from '../../routing/index.ts';
import { client as loaderRpc } from '../loader-rpc/index.ts';
import type { Build } from '../page/index.ts';
import { server } from '../server/index.ts';
import app from './app/src/app.tsx';
import Document from './app/src/document.tsx';
import layer from './app/src/layer.server.ts';
import loaders, { Greeting, reset, runs } from './app/src/loaders.server.ts';
import { Routes } from './app/src/routes.ts';

/*
 * Start's Worker for a small site: each Render Mode's HTML, status codes,
 * cache headers, lazy Views' preloads, and the Loader RPC.
 */

const build: Build = {
  id: 'build-1',
  base: '/',
  entry: {
    script: '/assets/entry.js',
    styles: ['/assets/entry.css'],
    preloads: ['/assets/react.js'],
  },
  views: {
    'src/lab.tsx': {
      script: '/assets/lab.js',
      styles: ['/assets/lab.css'],
      preloads: ['/assets/react.js', '/assets/chart.js'],
    },
  },
  head: [],
};

const worker = server({
  app,
  document: Document,
  loaders,
  layer,
  build,
});
const env = { WORD: 'Read:' };

const get = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://site.test${path}`, init), env);
const page = async (path: string, init?: RequestInit) => {
  const response = await get(path, init);
  return { response, html: await response.text() };
};
/** The Page the server wrote as JSON. */
const saved = (html: string) =>
  JSON.parse(
    /<script type="application\/json" id="kabuki-start">(.*?)<\/script>/s.exec(
      html,
    )![1]!,
  );

beforeEach(() => reset());

describe('a static page', () => {
  it('is drawn whole, with its Metadata, its files and the saved History', async () => {
    const { response, html } = await page('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8',
    );
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Home</title>');
    expect(html).toContain(
      '<meta name="description" content="Welcome" data-kabuki=""/>',
    );
    expect(html).toContain('<link rel="stylesheet" href="/assets/entry.css"/>');
    expect(html).toContain(
      '<link rel="modulepreload" href="/assets/react.js"/>',
    );
    expect(html).toContain(
      '<script type="module" src="/assets/entry.js"></script>',
    );
    expect(html).toContain('<p>home</p>');
    expect(saved(html).saved.entries).toHaveLength(1);
  });

  it('is drawn from its Loaders, with the server Layer made from the env', async () => {
    const { html } = await page('/blog/hello');
    expect(html).toContain('<p>2<!-- --> posts</p>');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<title>Hello</title>');
    expect(html).toContain('property="og:title" content="Hello"');
    expect(runs.sort()).toEqual(['Blog', 'Blog.Post:hello']);
  });

  it('is shared: kept in the Cache under the build id', async () => {
    const { response } = await page('/blog');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=31536000',
    );
  });

  it('is drawn once per build, and leaves the Cache with its own Cache-Control', async () => {
    const kept = new Map<string, Response>();
    // As a zone's Browser Cache TTL does to what comes out of the Cache.
    const raised = (response: Response) => {
      const copy = new Response(response.clone().body, response);
      copy.headers.set(
        'cache-control',
        'public, max-age=14400, s-maxage=31536000',
      );
      return copy;
    };
    vi.stubGlobal('caches', {
      default: {
        match: async (key: Request) => {
          const hit = kept.get(key.url);
          return hit && raised(hit);
        },
        put: async (key: Request, response: Response) => {
          kept.set(key.url, response);
        },
      },
    });
    try {
      const first = await page('/blog/hello');
      const second = await page('/blog/hello');
      expect(runs.filter((run) => run === 'Blog.Post:hello')).toHaveLength(1);
      expect(second.html).toBe(first.html);
      expect(second.response.headers.get('cache-control')).toBe(
        'public, max-age=0, s-maxage=31536000',
      );
      expect([...kept.keys()]).toEqual([
        'https://site.test/_kabuki/cache/build-1/blog/hello',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('writes Inputs as JSON that cannot close its script', async () => {
    const { html } = await page('/blog/evil');
    expect(html).not.toContain('<script>window.pwned');
    const json = /id="kabuki-start">(.*?)<\/script>/s.exec(html)![1]!;
    expect(json).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.stringify(saved(html))).toContain(
      '</script><script>window.pwned = true</script>',
    );
  });
});

describe('a dynamic page', () => {
  it('is drawn for the request, from its cookie, never kept', async () => {
    const { response, html } = await page('/account', {
      headers: { cookie: 'theme=x; user=ada' },
    });
    expect(response.status).toBe(200);
    expect(html).toContain('signed in as <!-- -->ada');
    expect(html).toContain('<p>the overview</p>');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('runs the Loaders of nested places at once', async () => {
    // Each of the two Loaders waits for the other to start.
    const { html } = await page('/account/settings', {
      headers: { cookie: 'user=ada' },
    });
    expect(html).toContain('<p>theme <!-- -->dark</p>');
    expect(runs.sort()).toEqual(['Account', 'Account.Settings']);
  });

  it("is a 302 to where a Loader's Redirect names", async () => {
    const response = await get('/account/settings');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/sign-in');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('a client place', () => {
  it('is drawn empty, with what is known of its Metadata, and its Loader never runs', async () => {
    const { response, html } = await page('/dashboard');
    expect(html).toContain('<title>Dashboard</title>');
    expect(html).toContain('<main id="app"></main>');
    expect(runs).toEqual([]);
    // Nothing above it is drawn per request.
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=31536000',
    );
  });

  it('under a dynamic place: the place above is drawn, its outlet empty', async () => {
    const { response, html } = await page('/account/activity', {
      headers: { cookie: 'user=ada' },
    });
    expect(html).toContain('signed in as <!-- -->ada');
    expect(html).toContain('<div id="account-outlet"></div>');
    expect(runs).toEqual(['Account']);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('a client place with no Input', () => {
  it('is drawn empty, with its Metadata', async () => {
    const { html } = await page('/sketch');
    expect(html).toContain('<title>Sketch</title>');
    expect(html).toContain('<main id="app"></main>');
    expect(html).not.toContain('the sketch');
  });
});

describe('the drawing', () => {
  it('says when and by which build the server drew it', async () => {
    const before = Date.now();
    const { html } = await page('/');
    expect(html).toContain('drawn by the server, build-1');
    const { drawn } = saved(html);
    expect(drawn.build).toBe('build-1');
    expect(drawn.at).toBeGreaterThanOrEqual(before);
    expect(drawn.at).toBeLessThanOrEqual(Date.now());
  });
});

describe('a URL that names no page', () => {
  it('draws the not-found Route with a 404', async () => {
    const { response, html } = await page('/nowhere');
    expect(response.status).toBe(404);
    expect(html).toContain('nothing at <!-- -->/nowhere');
  });

  it('draws it with a 404 when a Loader says its place is not found', async () => {
    const { response, html } = await page('/blog/missing');
    expect(response.status).toBe(404);
    expect(html).toContain('nothing at <!-- -->/blog/missing');
  });
});

describe('redirects', () => {
  it('a redirect in the Routes is a 308 to its Route', async () => {
    const response = await get('/posts/hello');
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/blog/hello');
  });

  it('a URL not written as its Route is a 308, keeping its query', async () => {
    const response = await get('/blog/hello/?ref=x');
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/blog/hello?ref=x');
  });

  it("a static Loader's Redirect is a 302", async () => {
    const response = await get('/blog/moved');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/blog/hello');
  });
});

describe('lazy Views', () => {
  it('are drawn whole, and their files preloaded in the head, marked with their id', async () => {
    const { html } = await page('/lab');
    expect(html).toContain('<p>the lab, loaded lazily</p>');
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain('<link rel="stylesheet" href="/assets/lab.css">');
    expect(head).toContain(
      '<link rel="modulepreload" href="/assets/chart.js">',
    );
    expect(head).toContain(
      '<link rel="modulepreload" href="/assets/lab.js" data-kabuki-view="src/lab.tsx">',
    );
    // What the entry preloads already is not written twice.
    expect(head.split('/assets/react.js')).toHaveLength(2);
  });
});

describe('other requests', () => {
  it('a HEAD is a GET without its body', async () => {
    const response = await get('/', { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('a POST to a page is not allowed', async () => {
    expect((await get('/', { method: 'POST' })).status).toBe(405);
  });

  it('a page that fails to draw is a 500, logged', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = server({
      app,
      document: () => {
        throw new Error('no document');
      },
      loaders,
      layer: Layer.succeed(Greeting, { word: '' }),
      build,
    });
    const response = await broken.fetch(new Request('https://site.test/'));
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('Something went wrong');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('the Loader RPC', () => {
  const loading = loaderRpc(Routes, {
    url: 'https://site.test/_kabuki/load',
    fetch: (input, init) =>
      worker.fetch(new Request(input as string, init), env),
  });
  const load = (
    places: ReadonlyArray<{
      readonly name: string;
      readonly params: Record<string, unknown>;
    }>,
    cookie?: string,
  ) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const found = yield* Loading;
        return yield* found.load(places);
      }).pipe(
        Effect.provide(
          cookie
            ? loaderRpc(Routes, {
                url: 'https://site.test/_kabuki/load',
                fetch: (input, init) =>
                  worker.fetch(
                    new Request(input as string, {
                      ...init,
                      headers: { ...init?.headers, cookie },
                    }),
                    env,
                  ),
              })
            : loading,
        ),
        Effect.result,
      ),
    );

  it('answers every place asked for in one request, decoded with its Schema', async () => {
    const answer = await load([
      { name: 'Blog', params: {} },
      { name: 'Blog.Post', params: { slug: 'hello' } },
    ]);
    expect(answer._tag).toBe('Success');
    expect(answer._tag === 'Success' && answer.success).toEqual({
      Blog: [
        { slug: 'hello', title: 'Read: Hello' },
        {
          slug: 'evil',
          title: 'Read: </script><script>window.pwned = true</script>',
        },
      ],
      'Blog.Post': { slug: 'hello', title: 'Hello', body: 'Hi.' },
    });
  });

  it('hands a dynamic Loader the request that asked', async () => {
    const answer = await load([{ name: 'Account', params: {} }], 'user=lin');
    expect(answer._tag === 'Success' && answer.success).toEqual({
      Account: { name: 'lin' },
    });
  });

  it('carries NotFound and Redirect back as failures', async () => {
    const missing = await load([{ name: 'Blog.Post', params: { slug: 'x' } }]);
    expect(missing._tag === 'Failure' && missing.failure._tag).toBe('NotFound');
    const moved = await load([{ name: 'Account', params: {} }]);
    expect(moved._tag === 'Failure' && moved.failure).toMatchObject({
      _tag: 'Redirect',
      route: Routes.SignIn(),
    });
  });

  it('refuses an ask it cannot read with a 400', async () => {
    const response = await get('/_kabuki/load', {
      method: 'POST',
      body: JSON.stringify({ places: [{ name: 'Home', params: {} }] }),
    });
    expect(response.status).toBe(400);
  });
});
