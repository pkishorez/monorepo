import { Context, Effect, Layer, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Page, Router } from '../../routing/index.ts';
import { Loading } from '../../routing/capabilities/index.ts';
import { View } from '../../react/index.ts';
import { Start } from '../app/index.ts';
import type { Pages } from '../app/index.ts';
import { loading as loaderRpc } from '../client/index.ts';
import type { Build } from '../app/protocol/index.ts';
import { Start as Server, handler } from '../server/index.ts';
import started, { AppView } from './app/src/app.tsx';
import Document from './app/src/document.tsx';
import served, {
  Greeting,
  loaders,
  reset,
  runs,
} from './app/src/loaders.server.ts';
import { router } from './app/src/routes.ts';

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

const worker = handler({ app: started, server: served, build });
const host = { env: { WORD: 'Read:' } };

const get = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://site.test${path}`, init), host);
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
      'public, max-age=0, s-maxage=31536000, no-transform',
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
    const cache = {
      match: async (key: Request) => {
        const hit = kept.get(key.url);
        return hit && raised(hit);
      },
      put: async (key: Request, response: Response) => {
        kept.set(key.url, response);
      },
    };
    const cached = (path: string) =>
      worker.fetch(new Request(`https://site.test${path}`), {
        ...host,
        cache,
      });
    const first = await cached('/blog/hello');
    const second = await cached('/blog/hello');
    expect(runs.filter((run) => run === 'Blog.Post:hello')).toHaveLength(1);
    expect(await second.text()).toBe(await first.text());
    expect(second.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=31536000, no-transform',
    );
    expect([...kept.keys()]).toEqual([
      'https://site.test/_kabuki/cache/build-1/blog/hello',
    ]);
  });

  it('puts its scroll back before the app hydrates, with an inline script', async () => {
    const { html } = await page('/');
    const script = html.indexOf('@kestack/kabuki/routing:scroll');
    expect(script).toBeGreaterThan(0);
    expect(script).toBeLessThan(html.indexOf('<script type="module"'));
    expect(saved(html).scroll).toContain('sessionStorage');
  });

  it('writes the data as JSON that cannot close its script', async () => {
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
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, no-transform',
    );
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
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, no-transform',
    );
  });
});

describe('a client place', () => {
  it('is drawn loading, with what is known of its Metadata, and its Loader never runs', async () => {
    const { response, html } = await page('/dashboard');
    expect(html).toContain('<title>Dashboard</title>');
    expect(html).toContain('<main id="app"><p>loading…</p></main>');
    expect(runs).toEqual([]);
    // Nothing above it is drawn per request.
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=31536000, no-transform',
    );
  });

  it('under a dynamic place: the place above is drawn, the client one loading', async () => {
    const { response, html } = await page('/account/activity', {
      headers: { cookie: 'user=ada' },
    });
    expect(html).toContain('signed in as <!-- -->ada');
    expect(html).toContain('<div id="account-outlet"><p>loading…</p></div>');
    expect(runs).toEqual(['Account']);
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, no-transform',
    );
  });
});

describe('a client place with no data', () => {
  it('has nothing to wait for: it is drawn whole, with its Metadata', async () => {
    const { html } = await page('/sketch');
    expect(html).toContain('<title>Sketch</title>');
    expect(html).toContain('the sketch');
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

  it('draws the page that is not found, failed, with a 404: the pages above it are drawn', async () => {
    const { response, html } = await page('/blog/missing');
    expect(response.status).toBe(404);
    expect(html).toContain('<p>2<!-- --> posts</p>');
    expect(html).toContain('<p>not found</p>');
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, no-transform',
    );
  });

  it('draws a page whose Loader broke, failed, with a 500, and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { response, html } = await page('/blog/broken');
    expect(response.status).toBe(500);
    expect(html).toContain('<p>2<!-- --> posts</p>');
    expect(html).toContain('<p>broke: the post broke</p>');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
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

  it("a Loader's permanent Redirect is a 308", async () => {
    const response = await get('/blog/renamed');
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/blog/hello');
  });

  it("a Loader's Redirect to a URL outside the app is a 302 to it", async () => {
    const response = await get('/blog/elsewhere');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.com/post');
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
    const broken = handler({
      app: Start.app({
        router,
        view: AppView,
        document: () => {
          throw new Error('no document');
        },
      }),
      server: Server.server({
        layer: Layer.succeed(Greeting, { word: '' }),
      }).loaders(loaders),
      build,
    });
    const response = await broken.fetch(
      new Request('https://site.test/'),
      host,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('Something went wrong');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

/** What the visitor may be made from: a service the layer gives. */
class Word extends Context.Service<Word, { readonly word: string }>()(
  'test/Word',
) {}
/** Who is visiting: a visitor service, made from the request. */
class Visitor extends Context.Service<Visitor, { readonly name: string }>()(
  'test/Visitor',
) {}

describe('what an app writes', () => {
  const greeting = Layer.succeed(Greeting, { word: 'Hi' });
  const seen = Layer.succeed(Visitor, { name: 'ada' });
  /** Visitor, made from Word. */
  const fromWord = Layer.effect(
    Visitor,
    Effect.gen(function* () {
      return { name: (yield* Word).word };
    }),
  );

  it('checks the Loaders against the Layers that give what they Require', () => {
    // @ts-expect-error the Loaders Require Greeting, and no Layer gives it
    Server.server().loaders(loaders);
    const served = Server.server({ layer: greeting }).loaders(loaders);
    expect(served.loaders).toBe(loaders);
    expect(served.layers.layer).toBe(greeting);
    // @ts-expect-error a static Loader Requires Greeting, which only the visitor gives
    Server.server({ visitor: greeting }).loaders(loaders);
    // A Layer written in place is typed as written.
    Server.server({ layer: Layer.succeed(Greeting, { word: 'Hi' }) }).loaders(
      loaders,
    );
    // The env is typed as the app says the platform gives it.
    Server.server({
      layer: Layer.effect(
        Greeting,
        Effect.map(Server.env<{ readonly WORD: string }>(), (env) => ({
          word: env.WORD,
        })),
      ),
    }).loaders(loaders);
  });

  it('takes Loaders that Require nothing alone', () => {
    const Home = Page.define({ path: '/', data: Schema.String });
    const plain = Router.define(Page.define({ pages: { Home } })).loaders({
      Home: () => Effect.succeed('hi'),
    });
    const served = Server.server(plain);
    expect(served.loaders).toBe(plain);
    expect(served.layers).toEqual({});
    // @ts-expect-error the Loaders Require Greeting: the Layer that gives it comes first
    Server.server(loaders);
  });

  it('takes no Layers, or `undefined`, before the Loaders', () => {
    const Home = Page.define({ path: '/', data: Schema.String });
    const plain = Router.define(Page.define({ pages: { Home } })).loaders({
      Home: () => Effect.succeed('hi'),
    });
    expect(Server.server().loaders(plain).loaders).toBe(plain);
    expect(Server.server(undefined).loaders(plain).loaders).toBe(plain);
    expect(Server.server({}).loaders).toEqual({});
  });

  it('checks each Layer against what it may be made from', () => {
    Server.server({
      layer: Layer.merge(greeting, Layer.succeed(Word, { word: 'Hi' })),
      visitor: fromWord,
    }).loaders(loaders);
    // @ts-expect-error the visitor Requires Word, which the layer does not give
    Server.server({ layer: greeting, visitor: fromWord }).loaders(loaders);
    // The visitor may read the request; the layer, made once, may not.
    const fromRequest = Layer.effect(
      Visitor,
      Server.Request.use((request) =>
        Effect.succeed({ name: new URL(request.url).hostname }),
      ),
    );
    Server.server({ layer: greeting, visitor: fromRequest }).loaders(loaders);
    Server.server({
      // @ts-expect-error the layer is made once: it may read only the env
      layer: Layer.merge(greeting, fromRequest),
    });
  });

  it('keeps the visitor from static Loaders, whose pages everyone shares', () => {
    const visiting = router.loaders({
      ...loaders,
      // Account is dynamic: it may ask who is visiting.
      Account: () =>
        Effect.gen(function* () {
          return { name: (yield* Visitor).name };
        }),
    });
    Server.server({ layer: greeting, visitor: seen }).loaders(visiting);
    const leaking = router.loaders({
      ...loaders,
      // Blog is static: what it answers is kept for everyone.
      Blog: () =>
        Effect.gen(function* () {
          yield* Visitor;
          return [];
        }),
    });
    // @ts-expect-error a static Loader Requires Visitor, which only the visitor gives
    Server.server({ layer: greeting, visitor: seen }).loaders(leaking);
    // A dynamic Loader may add headers to its response; a static one may not.
    Server.server({ layer: greeting }).loaders(
      router.loaders({
        ...loaders,
        Account: () =>
          Effect.as(
            Server.ResponseHeaders.use((headers) => headers.append('x', 'y')),
            { name: 'ada' },
          ),
      }),
    );
    Server.server({ layer: greeting }).loaders(
      // @ts-expect-error a static Loader's page is kept for everyone: no headers of its own
      router.loaders({
        ...loaders,
        Blog: () =>
          Effect.as(
            Server.ResponseHeaders.use((headers) => headers.append('x', 'y')),
            [],
          ),
      }),
    );
  });

  it('lets every Loader use the visitor when no place with data is static', () => {
    const Home = Page.define({ path: '/' });
    const Account = Page.define({
      path: '/account',
      render: 'dynamic',
      data: Schema.Struct({ name: Schema.String }),
    });
    const Dynamic = Router.define(Page.define({ pages: { Home, Account } }));
    Server.server({ visitor: seen }).loaders(
      Dynamic.loaders({
        Account: () =>
          Effect.gen(function* () {
            return { name: (yield* Visitor).name };
          }),
      }),
    );
  });

  it('checks the app’s Layer against what its Actors Require', () => {
    const Home = Page.define({ path: '/' });
    const Greeter = Page.define({ requires: [Greeting], pages: { Home } });
    const GreeterView = View.make(
      Greeter.build({ pages: { Home: Home.build() } }),
      () => null,
    );
    const greeter = Router.define(Greeter);
    // @ts-expect-error the app Requires Greeting in the browser
    Start.app({ router: greeter, view: GreeterView });
    // @ts-expect-error a Document is not a Layer
    Start.app({ router: greeter, view: GreeterView, document: Document });
    expect(
      Start.app({ router: greeter, view: GreeterView, layer: greeting }).layer,
    ).toBe(greeting);
    expect(Start.app({ router, view: AppView }).document).toBeUndefined();
  });

  it('refuses a default export it cannot check', () => {
    expect(() => handler({ app: AppView as never, build })).toThrow(
      'src/app must default-export Start.app({ router, view, … })',
    );
    expect(() =>
      handler({ app: started, server: loaders as never, build }),
    ).toThrow('src/loaders.server must default-export Start.server(');
  });

  it('draws an app with no Document in the plainest one, with no Loaders', async () => {
    const bare = handler({
      app: Start.app({ router, view: AppView }),
      build: { ...build, id: undefined },
    });
    const response = await bare.fetch(new Request('https://site.test/'), host);
    const html = await response.text();
    expect(html).toMatch(
      /^<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"\/>/,
    );
    expect(html).toContain('<p>home</p>');
  });
});

describe('the Loaders’ Layers', () => {
  /** A server whose Layers count how often each is made. */
  const counted = (
    word: () => Effect.Effect<{ readonly word: string }> = () =>
      Effect.succeed({ word: 'Hi' }),
  ) => {
    const made = { layer: 0, visitor: 0 };
    const worker = handler({
      app: started,
      server: Server.server({
        layer: Layer.effect(
          Greeting,
          Effect.suspend(() => {
            made.layer++;
            return word();
          }),
        ),
        visitor: Layer.effectDiscard(
          Effect.gen(function* () {
            made.visitor++;
            const { WORD } = yield* Server.env<{ readonly WORD: string }>();
            const headers = yield* Server.ResponseHeaders;
            yield* headers.append('set-cookie', 'seen=1');
            yield* headers.append('x-word', WORD);
          }),
        ),
      }).loaders(loaders),
      build: { ...build, id: undefined },
    });
    const fetch = (
      path: string,
      init?: RequestInit,
      env: { readonly WORD: string } = host.env,
    ) => worker.fetch(new Request(`https://site.test${path}`, init), { env });
    return { made, fetch };
  };

  it('makes the layer once, for every request that loads', async () => {
    const { made, fetch } = counted();
    await fetch('/blog');
    await fetch('/blog/hello');
    await fetch('/');
    expect(made).toEqual({ layer: 1, visitor: 0 });
  });

  it('makes the visitor only for a dynamic or client place, and sends the headers it adds', async () => {
    const { made, fetch } = counted();
    const page = await fetch('/account', { headers: { cookie: 'user=ada' } });
    expect(page.status).toBe(200);
    expect(page.headers.get('set-cookie')).toBe('seen=1');
    const rpc = await fetch('/_kabuki/load', {
      method: 'POST',
      body: JSON.stringify({ places: [{ name: 'Dashboard', params: {} }] }),
    });
    expect(rpc.headers.get('set-cookie')).toBe('seen=1');
    const shared = await fetch('/blog');
    expect(shared.headers.get('set-cookie')).toBeNull();
    expect(made.visitor).toBe(2);
  });

  it('gives the visitor the env of the request it is made for', async () => {
    const { fetch } = counted();
    const signedIn = { headers: { cookie: 'user=ada' } };
    const first = await fetch('/account', signedIn, { WORD: 'one' });
    const second = await fetch('/account', signedIn, { WORD: 'two' });
    expect(first.headers.get('x-word')).toBe('one');
    expect(second.headers.get('x-word')).toBe('two');
  });

  it('makes the layer again if making it failed', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    let tries = 0;
    const { made, fetch } = counted(() =>
      tries++ === 0
        ? Effect.die(new Error('the database is down'))
        : Effect.succeed({ word: 'Hi' }),
    );
    expect((await fetch('/blog')).status).toBe(500);
    expect((await fetch('/blog')).status).toBe(200);
    expect((await fetch('/blog')).status).toBe(200);
    expect(made.layer).toBe(2);
    logged.mockRestore();
  });
});

describe('the Loader RPC', () => {
  const loading = loaderRpc(router, {
    url: 'https://site.test/_kabuki/load',
    fetch: (input, init) =>
      worker.fetch(new Request(input as string, init), host),
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
            ? loaderRpc(router, {
                url: 'https://site.test/_kabuki/load',
                fetch: (input, init) =>
                  worker.fetch(
                    new Request(input as string, {
                      ...init,
                      headers: { ...init?.headers, cookie },
                    }),
                    host,
                  ),
              })
            : loading,
        ),
      ),
    );

  it('answers every place asked for in one request, decoded with its Schema', async () => {
    const answer = await load([
      { name: 'Blog', params: {} },
      { name: 'Blog.Post', params: { slug: 'hello' } },
    ]);
    expect(answer).toEqual({
      Blog: {
        _tag: 'Loaded',
        data: [
          { slug: 'hello', title: 'Read: Hello' },
          {
            slug: 'evil',
            title: 'Read: </script><script>window.pwned = true</script>',
          },
        ],
      },
      'Blog.Post': {
        _tag: 'Loaded',
        data: { slug: 'hello', title: 'Hello', body: 'Hi.' },
      },
    });
  });

  it('hands a dynamic Loader the request that asked', async () => {
    const answer = await load([{ name: 'Account', params: {} }], 'user=lin');
    expect(answer).toEqual({
      Account: { _tag: 'Loaded', data: { name: 'lin' } },
    });
  });

  it('answers each place on its own: not found, a Redirect, broken', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const answer = await load([
      { name: 'Blog', params: {} },
      { name: 'Blog.Post', params: { slug: 'x' } },
      { name: 'Account', params: {} },
    ]);
    expect(answer['Blog']?._tag).toBe('Loaded');
    expect(answer['Blog.Post']).toEqual({ _tag: 'NotFound' });
    expect(answer['Account']).toEqual({
      _tag: 'Redirect',
      route: router.SignIn(),
    });
    expect(
      await load([{ name: 'Blog.Post', params: { slug: 'renamed' } }]),
    ).toEqual({
      'Blog.Post': {
        _tag: 'Redirect',
        route: router.Blog.Post({ slug: 'hello' }),
        permanent: true,
      },
    });
    expect(
      await load([{ name: 'Blog.Post', params: { slug: 'elsewhere' } }]),
    ).toEqual({
      'Blog.Post': { _tag: 'Redirect', href: 'https://example.com/post' },
    });
    const broken = await load([
      { name: 'Blog.Post', params: { slug: 'broken' } },
    ]);
    expect(broken['Blog.Post']).toEqual({
      _tag: 'Broken',
      reason: 'the post broke',
    });
    logged.mockRestore();
  });

  it('answers one line per place, each as soon as its Loader is done', async () => {
    const response = await get('/_kabuki/load', {
      method: 'POST',
      body: JSON.stringify({
        places: [
          { name: 'Blog', params: {} },
          { name: 'Blog.Post', params: { slug: 'x' } },
        ],
      }),
    });
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    const lines = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { readonly name: string });
    expect(lines.map(({ name }) => name).sort()).toEqual(['Blog', 'Blog.Post']);
  });

  it('in the browser, breaks only the places a broken answer had not reached', async () => {
    const answer = await Effect.runPromise(
      Effect.gen(function* () {
        const found = yield* Loading;
        return yield* found.load([
          { name: 'Blog', params: {} },
          { name: 'Dashboard', params: {} },
        ]);
      }).pipe(
        Effect.provide(
          loaderRpc(router, {
            fetch: async () =>
              new Response(
                `${JSON.stringify({ name: 'Blog', outcome: { _tag: 'Loaded', data: [] } })}\nnot json\n`,
              ),
          }),
        ),
      ),
    );
    expect(answer['Blog']).toEqual({ _tag: 'Loaded', data: [] });
    expect(answer['Dashboard']?._tag).toBe('Broken');
  });

  it('refuses an ask it cannot read with a 400', async () => {
    const response = await get('/_kabuki/load', {
      method: 'POST',
      body: JSON.stringify({ places: [{ name: 'Home', params: {} }] }),
    });
    expect(response.status).toBe(400);
  });
});

describe('the Pages', () => {
  it('names every page with its path and how its first drawing is made', async () => {
    const response = await get(Start.pages);
    expect(response.headers.get('content-type')).toBe('application/json');
    const pages = (await response.json()) as Pages;
    expect(pages.build).toBe('build-1');
    expect(pages.shell).toBe('/_kabuki/shell');
    const by = Object.fromEntries(pages.pages.map((one) => [one.name, one]));
    expect(by['Home']).toEqual({
      name: 'Home',
      path: '/',
      params: false,
      render: 'static',
    });
    expect(by['Blog.Post']).toMatchObject({
      path: '/blog/:slug',
      params: true,
      render: 'static',
    });
    expect(by['Account']?.render).toBe('dynamic');
    // A client place under a dynamic one: the server still draws the dynamic one.
    expect(by['Account.Activity']?.render).toBe('dynamic');
    expect(by['Dashboard']?.render).toBe('client');
    expect(by['Sketch']?.render).toBe('client');
  });

  it('says no build in dev', async () => {
    const dev = handler({
      app: started,
      server: served,
      build: { ...build, id: undefined },
    });
    const response = await dev.fetch(
      new Request(`https://site.test${Start.pages}`),
      host,
    );
    expect(((await response.json()) as Pages).build).toBeNull();
  });

  it('answers nothing but a GET or a HEAD', async () => {
    expect((await get(Start.pages, { method: 'POST' })).status).toBe(405);
    const head = await get(Start.pages, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});

describe('the App Shell', () => {
  it('is the Document with its files and no app, which the browser draws', async () => {
    const { response, html } = await page('/_kabuki/shell');
    expect(response.status).toBe(200);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<link rel="stylesheet" href="/assets/entry.css"/>');
    expect(html).toContain(
      '<script type="module" src="/assets/entry.js"></script>',
    );
    expect(html).not.toContain('<p>home</p>');
    expect(html).not.toContain('<title>');
    const shell = saved(html);
    expect(shell.saved).toBeUndefined();
    expect(shell.drawn.build).toBe('build-1');
    expect(runs).toEqual([]);
  });

  it('is kept as a static page is, once per build', async () => {
    const kept = new Map<string, Response>();
    const cache = {
      match: async (key: Request) => kept.get(key.url)?.clone(),
      put: async (key: Request, response: Response) => {
        kept.set(key.url, response);
      },
    };
    const response = await worker.fetch(
      new Request('https://site.test/_kabuki/shell'),
      { ...host, cache },
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=31536000, no-transform',
    );
    expect([...kept.keys()]).toEqual([
      'https://site.test/_kabuki/cache/build-1/_kabuki/shell',
    ]);
  });
});
