import { Effect, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { Page, Router } from '../../routing/index.ts';
import { Loading } from '../../routing/capabilities/index.ts';
import { View } from '../../react/index.ts';
import { Start } from '../app/index.ts';
import type { Build } from '../app/protocol/index.ts';
import { loading } from '../client/rpc.ts';
import { cloudflare } from '../platform/cloudflare/index.ts';
import { Start as Server, handler, prerender } from '../server/index.ts';
import { withLines } from '../vite/prerender.ts';
import started from './app/src/app.tsx';
import served, { reset, runs } from './app/src/loaders.server.ts';
import { router } from './app/src/routes.ts';

/*
 * Start at the build, for the same small site: every static page drawn and
 * each static place's answer kept, then the server and the browser reading
 * those answers rather than running a Loader.
 */

const DATA = '/_kabuki/data/build-1';
const build: Build = {
  id: 'build-1',
  base: '/',
  data: DATA,
  entry: { script: '/assets/entry.js', styles: [], preloads: [] },
  views: {
    'src/lab.tsx': { script: '/assets/lab.js', styles: [], preloads: [] },
  },
  head: [],
};
const env = { WORD: 'Read:' };

/** A build's files, kept in memory by their path from the client's folder. */
const drawSite = async (
  options: Parameters<typeof prerender>[0] = {
    app: started,
    server: served,
    build,
  },
) => {
  const files = new Map<string, string>();
  const drawn = await prerender(options)(async (file, body) => {
    files.set(file, body);
  }, env);
  return { files, drawn };
};

/** A platform that hands the server the build's files, as Cloudflare's assets do: `/blog` is `blog.html`. */
const hostOf = (files: ReadonlyMap<string, string>) => ({
  env,
  files: async (path: string) => {
    const file = decodeURIComponent(path.slice(1));
    const body = files.get(file) ?? files.get(`${file}.html`);
    return body === undefined ? undefined : new Response(body);
  },
});

/** The Page a drawing wrote as JSON. */
const saved = (html: string) =>
  JSON.parse(
    /<script type="application\/json" id="kabuki-start">(.*?)<\/script>/s.exec(
      html,
    )![1]!,
  );

const lines = async (response: Response) =>
  (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .sort((a, b) => a.name.localeCompare(b.name));

beforeEach(() => reset());

describe('the build', () => {
  it('draws every static page at its URL, each listed path of one with params, and each client page under them', async () => {
    const { files, drawn } = await drawSite();
    expect(drawn.pages).toEqual([
      '/',
      '/blog',
      '/blog/hello',
      '/blog/evil',
      '/dashboard',
      '/lab',
      '/gallery',
      '/sign-in',
      '/sketch',
    ]);
    expect([...files.keys()].filter((file) => file.endsWith('.html'))).toEqual([
      'index.html',
      'blog.html',
      'blog/hello.html',
      'blog/evil.html',
      'dashboard.html',
      'lab.html',
      'gallery.html',
      'sign-in.html',
      'sketch.html',
      '_kabuki/shell.html',
    ]);
    const html = files.get('blog/hello.html')!;
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Hello</title>');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<p>2<!-- --> posts</p>');
    // The browser is told where the build kept the Static Data.
    expect(saved(html).data).toBe(DATA);
    // A lazy View it drew is preloaded, as the server's drawing does.
    expect(files.get('lab.html')).toContain('data-kabuki-view="src/lab.tsx"');
  });

  it('keeps each static place’s answer, its Loader run once', async () => {
    const { files, drawn } = await drawSite();
    expect(drawn.data).toBe(3);
    expect(JSON.parse(files.get('_kabuki/data/build-1/Blog.json')!)).toEqual({
      _tag: 'Loaded',
      data: [
        { slug: 'hello', title: 'Read: Hello' },
        {
          slug: 'evil',
          title: 'Read: </script><script>window.pwned = true</script>',
        },
      ],
    });
    expect(
      JSON.parse(files.get('_kabuki/data/build-1/Blog.Post/hello.json')!),
    ).toEqual({
      _tag: 'Loaded',
      data: { slug: 'hello', title: 'Hello', body: 'Hi.' },
    });
    expect(runs.sort()).toEqual(['Blog', 'Blog.Post:evil', 'Blog.Post:hello']);
  });

  it('draws a client page under static ones loading, as the server does, and never runs its Loader', async () => {
    const { files } = await drawSite();
    const html = files.get('dashboard.html')!;
    const loading = '<main id="app"><p>loading…</p></main>';
    expect(html).toContain('<title>Dashboard</title>');
    expect(html).toContain(loading);
    const server = await handler({ app: started, server: served, build }).fetch(
      new Request('https://site.test/dashboard'),
      { env },
    );
    expect(await server.text()).toContain(loading);
    expect(files.has('_kabuki/data/build-1/Dashboard.json')).toBe(false);
    expect(runs).not.toContain('Dashboard');
  });

  it('draws nothing under a dynamic page: that is the server’s', async () => {
    const { files } = await drawSite();
    for (const file of [
      'account.html',
      'account/settings.html',
      'account/activity.html',
    ])
      expect(files.has(file)).toBe(false);
  });

  it('writes the App Shell, the same for every URL', async () => {
    const { files } = await drawSite();
    const shell = files.get('_kabuki/shell.html')!;
    expect(shell.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(saved(shell).saved).toBeUndefined();
    expect(saved(shell).data).toBe(DATA);
  });

  it('is only a build’s to do', async () => {
    await expect(
      drawSite({
        app: started,
        server: served,
        build: { ...build, id: undefined },
      }),
    ).rejects.toThrow('only a build draws the static pages');
  });
});

describe('a static place under one with params', () => {
  const Data = Schema.Struct({ title: Schema.String });
  const Guide = Page.define({
    path: '/:guide',
    params: { guide: Schema.String },
    data: Data,
  });
  const About = Page.define({ path: '/about', data: Data });
  const Section = Page.define({
    path: '/docs/:section',
    params: { section: Schema.String },
    // A path the URL names first: `/docs/start/about` is About, never a Guide.
    pages: { About, Guide },
  });
  const Root = Page.define({ pages: { Section } });
  const RootLive = Root.build({
    pages: {
      Section: Section.build({
        pages: { Guide: Guide.build(), About: About.build() },
      }),
    },
  });
  const docs = Router.define(Root);
  const app = Start.app({
    router: docs,
    view: View.make(RootLive, () => <p>docs</p>),
  });
  const site = (guides: ReadonlyArray<{ section: string; guide: string }>) =>
    drawSite({
      app,
      server: Server.server(
        docs.loaders({
          // No data, and params: it only lists where it is.
          Section: {
            paths: () =>
              Effect.succeed([{ section: 'start' }, { section: 'deploy' }]),
          },
          'Section.Guide': {
            paths: () => Effect.succeed(guides),
            load: ({ section, guide }) =>
              guide === 'gone'
                ? Effect.fail(Page.notFound())
                : Effect.succeed({ title: `${section}/${guide}` }),
          },
          'Section.About': ({ section }) =>
            Effect.succeed({ title: `about ${section}` }),
        }),
      ),
      build,
    });

  it('is drawn wherever the page above it is, and at each path of its own', async () => {
    const { files, drawn } = await site([
      { section: 'start', guide: 'install' },
      // Listed twice, drawn once.
      { section: 'start', guide: 'install' },
    ]);
    expect(drawn.pages).toEqual([
      '/docs/start',
      '/docs/deploy',
      '/docs/start/about',
      '/docs/deploy/about',
      '/docs/start/install',
    ]);
    expect(files.has('docs/start/install.html')).toBe(true);
    expect(
      JSON.parse(files.get('_kabuki/data/build-1/Section.About/deploy.json')!),
    ).toEqual({ _tag: 'Loaded', data: { title: 'about deploy' } });
    expect(
      JSON.parse(
        files.get('_kabuki/data/build-1/Section.Guide/start/install.json')!,
      ),
    ).toEqual({ _tag: 'Loaded', data: { title: 'start/install' } });
  });

  it('is refused under a path the page above does not list', async () => {
    await expect(site([{ section: 'other', guide: 'x' }])).rejects.toThrow(
      'Section.Guide lists {"section":"other","guide":"x"}, under a path Section does not list',
    );
  });

  it('must load at every path it lists', async () => {
    await expect(site([{ section: 'start', guide: 'gone' }])).rejects.toThrow(
      'Section.Guide at {"section":"start","guide":"gone"} is not found, and a path a static place lists must load',
    );
  });

  it('must list its paths', async () => {
    await expect(
      drawSite({
        app,
        server: Server.server({
          'Section.About': () => Effect.succeed({ title: '' }),
        } as never),
        build,
      }),
    ).rejects.toThrow(
      'Section is static and its path names params, so its Loader lists every path it is at',
    );
  });

  it('cannot be written where a file’s name cannot be', async () => {
    await expect(site([{ section: 'start', guide: '..' }])).rejects.toThrow(
      'cannot be written as a file',
    );
  });
});

describe('a static page whose URL is another’s', () => {
  const view = (live: never) => View.make(live, () => <p>site</p>);

  it('is drawn once, as its index page, which its URL reads as', async () => {
    const Index = Page.define({ path: '/' });
    const Docs = Page.define({ path: '/docs', pages: { Index } });
    const Root = Page.define({ pages: { Docs } });
    const live = Root.build({
      pages: { Docs: Docs.build({ pages: { Index: Index.build() } }) },
    });
    const { drawn } = await drawSite({
      app: Start.app({
        router: Router.define(Root),
        view: view(live as never),
      }),
      build,
    });
    expect(drawn.pages).toEqual(['/docs']);
  });

  it('cannot need a query', async () => {
    const Search = Page.define({
      path: '/search',
      query: { q: Schema.String },
    });
    const Root = Page.define({ pages: { Search } });
    const live = Root.build({ pages: { Search: Search.build() } });
    const site = drawSite({
      app: Start.app({
        router: Router.define(Root),
        view: view(live as never),
      }),
      build,
    });
    await expect(site).rejects.toThrow(/Search .*no query/);
  });
});

describe('a client page, at the build', () => {
  const Tab = Schema.Literals(['inbox', 'sent']);
  const Mail = Page.define({ path: '/mail', render: 'client' });
  const Thread = Page.define({
    path: '/threads/:id',
    params: { id: Schema.String },
    render: 'client',
  });
  const Folder = Page.define({
    path: '/folder',
    query: { tab: Tab },
    render: 'client',
  });
  const Root = Page.define({ pages: { Mail, Thread, Folder } });
  const RootLive = Root.build({
    pages: {
      Mail: Mail.build(),
      Thread: Thread.build(),
      Folder: Folder.build(),
    },
  });
  const view = View.make(RootLive, () => <p>mail</p>);

  it('is drawn where its URL is known, and left to the server where its path names params or it needs a query', async () => {
    const { files, drawn } = await drawSite({
      app: Start.app({ router: Router.define(Root), view }),
      build,
    });
    expect(drawn.pages).toEqual(['/mail']);
    expect(files.has('mail.html')).toBe(true);
    expect(files.has('folder.html')).toBe(false);
  });

  it('is never drawn under a client root: the App Shell is every URL', async () => {
    const Client = Page.define({ render: 'client', pages: { Mail } });
    const { files, drawn } = await drawSite({
      app: Start.app({
        router: Router.define(Client),
        view: View.make(Client.build({ pages: { Mail: Mail.build() } }), () => (
          <p>mail</p>
        )),
      }),
      build,
    });
    expect(drawn.pages).toEqual([]);
    expect([...files.keys()]).toEqual(['_kabuki/shell.html']);
  });
});

describe('the server, with the build’s files', () => {
  const worker = handler({ app: started, server: served, build });
  const ask = (
    host: ReturnType<typeof hostOf>,
    places: ReadonlyArray<object>,
  ) =>
    worker.fetch(
      new Request('https://site.test/_kabuki/load', {
        method: 'POST',
        body: JSON.stringify({ places }),
      }),
      host,
    );

  it('reads a static place’s answer as the build kept it, and runs no Loader', async () => {
    const host = hostOf((await drawSite()).files);
    reset();
    expect(
      await lines(
        await ask(host, [
          { name: 'Blog', params: {} },
          { name: 'Blog.Post', params: { slug: 'hello' } },
        ]),
      ),
    ).toEqual([
      {
        name: 'Blog',
        outcome: {
          _tag: 'Loaded',
          data: [
            { slug: 'hello', title: 'Read: Hello' },
            {
              slug: 'evil',
              title: 'Read: </script><script>window.pwned = true</script>',
            },
          ],
        },
      },
      {
        name: 'Blog.Post',
        outcome: {
          _tag: 'Loaded',
          data: { slug: 'hello', title: 'Hello', body: 'Hi.' },
        },
      },
    ]);
    expect(runs).toEqual([]);
  });

  it('finds no place at a path the build did not list, whatever its Loader would say', async () => {
    const host = hostOf((await drawSite()).files);
    reset();
    // Its Loader would Redirect: it is never asked.
    expect(
      await lines(
        await ask(host, [{ name: 'Blog.Post', params: { slug: 'moved' } }]),
      ),
    ).toEqual([{ name: 'Blog.Post', outcome: { _tag: 'NotFound' } }]);
    const page = await worker.fetch(
      new Request('https://site.test/blog/moved'),
      host,
    );
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('<p>not found</p>');
    expect(runs).toEqual([]);
  });

  it('still runs the Loader of a dynamic or client place', async () => {
    const host = hostOf((await drawSite()).files);
    reset();
    expect(
      await lines(
        await ask(host, [
          { name: 'Dashboard', params: {} },
          { name: 'Blog', params: {} },
        ]),
      ),
    ).toMatchObject([
      { name: 'Blog', outcome: { _tag: 'Loaded' } },
      { name: 'Dashboard', outcome: { _tag: 'Loaded' } },
    ]);
    expect(runs).toEqual(['Dashboard']);
  });

  it('answers the App Shell the build wrote, without drawing it', async () => {
    const files = new Map([
      ['_kabuki/shell.html', '<!DOCTYPE html><p>kept</p>'],
    ]);
    const response = await worker.fetch(
      new Request('https://site.test/_kabuki/shell'),
      hostOf(files),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage');
    expect(await response.text()).toBe('<!DOCTYPE html><p>kept</p>');
  });

  it('answers a URL that is all static and that the build did not draw not found, with no data to say so', async () => {
    const { files } = await drawSite();
    const response = await worker.fetch(
      new Request('https://site.test/gallery/nope'),
      hostOf(files),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('answers a 410 for another build’s Static Data, or with no files, so the browser asks the Loader RPC', async () => {
    for (const [path, host] of [
      ['/_kabuki/data/build-0/Blog.json', hostOf(new Map())],
      [`${DATA}/Blog.json`, { env }],
    ] as const) {
      const response = await worker.fetch(
        new Request(`https://site.test${path}`),
        host,
      );
      expect(response.status).toBe(410);
    }
  });

  it('answers a 404 where the build kept no answer', async () => {
    const response = await worker.fetch(
      new Request(`https://site.test${DATA}/Blog.Post/nope.json`),
      hostOf(new Map()),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('runs a static Loader when asked, on a platform that hands it no files', async () => {
    const response = await worker.fetch(
      new Request('https://site.test/blog/hello'),
      { env },
    );
    expect(response.status).toBe(200);
    expect(runs.sort()).toEqual(['Blog', 'Blog.Post:hello']);
  });
});

describe('the browser, with the build’s Data', () => {
  const worker = handler({ app: started, server: served, build });
  /** A browser's `fetch`: the platform answers a file, the server the rest. */
  const browser = async () => {
    const { files } = await drawSite();
    reset();
    const asked: Array<string> = [];
    const fetch = (async (input: string, init?: RequestInit) => {
      asked.push(`${init?.method ?? 'GET'} ${input}`);
      const body = files.get(decodeURIComponent(input.slice(1)));
      return body !== undefined
        ? new Response(body)
        : worker.fetch(
            new Request(`https://site.test${input}`, init),
            hostOf(files),
          );
    }) as typeof globalThis.fetch;
    const load = (places: ReadonlyArray<{ name: string; params: object }>) =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* Loading).load(places as never);
        }).pipe(Effect.provide(loading(router, { data: DATA, fetch }))),
      );
    return { asked, load };
  };

  it('reads a static place with a GET of its file, and asks the Loader RPC for the rest', async () => {
    const { asked, load } = await browser();
    const answers = await load([
      { name: 'Blog.Post', params: { slug: 'hello' } },
      { name: 'Dashboard', params: {} },
    ]);
    expect(answers['Blog.Post']).toEqual({
      _tag: 'Loaded',
      data: { slug: 'hello', title: 'Hello', body: 'Hi.' },
    });
    expect(answers['Dashboard']).toMatchObject({ _tag: 'Loaded' });
    expect(asked.sort()).toEqual([
      `GET ${DATA}/Blog.Post/hello.json`,
      'POST /_kabuki/load',
    ]);
    // No static Loader ran for it.
    expect(runs).toEqual(['Dashboard']);
  });

  it('asks nothing of the server for static places alone', async () => {
    const { asked, load } = await browser();
    await load([{ name: 'Blog', params: {} }]);
    expect(asked).toEqual([`GET ${DATA}/Blog.json`]);
    expect(runs).toEqual([]);
  });

  it('finds a path the build did not list not found', async () => {
    const { load } = await browser();
    expect(
      await load([{ name: 'Blog.Post', params: { slug: 'nope' } }]),
    ).toEqual({ 'Blog.Post': { _tag: 'NotFound' } });
    expect(runs).toEqual([]);
  });

  it('asks the Loader RPC once the server keeps no answers of its build, as after a deploy', async () => {
    // The next build is deployed: it keeps none of this one's answers.
    const next = { ...build, id: 'build-2', data: '/_kabuki/data/build-2' };
    const { files } = await drawSite({
      app: started,
      server: served,
      build: next,
    });
    const deployed = handler({ app: started, server: served, build: next });
    const asked: Array<string> = [];
    const fetch = (async (input: string, init?: RequestInit) => {
      asked.push(`${init?.method ?? 'GET'} ${input}`);
      return deployed.fetch(
        new Request(`https://site.test${input}`, init),
        hostOf(files),
      );
    }) as typeof globalThis.fetch;
    const layer = loading(router, { data: DATA, fetch });
    const load = (places: ReadonlyArray<{ name: string; params: object }>) =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* Loading).load(places as never);
        }).pipe(Effect.provide(layer)),
      );
    expect((await load([{ name: 'Blog', params: {} }]))['Blog']).toMatchObject({
      _tag: 'Loaded',
    });
    await load([{ name: 'Blog.Post', params: { slug: 'hello' } }]);
    expect(asked).toEqual([
      `GET ${DATA}/Blog.json`,
      'POST /_kabuki/load',
      // Then never the files again.
      'POST /_kabuki/load',
    ]);
  });

  it('asks the Loader RPC for a static place where no build kept the Static Data, as in dev', async () => {
    const asked: Array<string> = [];
    const answers = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Loading).load([{ name: 'Blog', params: {} }]);
      }).pipe(
        Effect.provide(
          loading(router, {
            fetch: (async (input: string, init?: RequestInit) => {
              asked.push(`${init?.method ?? 'GET'} ${input}`);
              return worker.fetch(
                new Request(`https://site.test${input}`, init),
                { env },
              );
            }) as typeof globalThis.fetch,
          }),
        ),
      ),
    );
    expect(answers['Blog']).toMatchObject({ _tag: 'Loaded' });
    expect(asked).toEqual(['POST /_kabuki/load']);
  });
});

describe('what the host is told', () => {
  it('on Cloudflare, that the Static Data never changes', () => {
    expect(cloudflare().files?.({ data: DATA })).toEqual({
      _headers: `${DATA}/*\n  Cache-Control: public, max-age=31536000, immutable`,
    });
  });

  it('is Start’s own block in the host’s file, written again by each build', () => {
    const first = withLines('/sw.js\n  Cache-Control: no-cache\n', 'one');
    expect(first).toBe(
      '/sw.js\n  Cache-Control: no-cache\n# kabuki start: begin\none\n# kabuki start: end\n',
    );
    expect(withLines(first, 'two')).toBe(
      '/sw.js\n  Cache-Control: no-cache\n# kabuki start: begin\ntwo\n# kabuki start: end\n',
    );
    expect(withLines(undefined, 'one')).toBe(
      '# kabuki start: begin\none\n# kabuki start: end\n',
    );
  });
});
