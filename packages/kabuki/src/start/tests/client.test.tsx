// @vitest-environment jsdom
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from '../../react/app/index.ts';
import { client } from '../client/index.ts';
import type { Build } from '../app/protocol/index.ts';
import { handler } from '../server/index.ts';
import { Start } from '../app/index.ts';
import started, { AppView } from './app/src/app.tsx';
import { router } from './app/src/routes.ts';
import Document from './app/src/document.tsx';
import server, { reset, runs } from './app/src/loaders.server.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A page the server drew, hydrated in a document: it matches, its Runtime
 * starts, and the places drawn without their Input load through the Loader
 * RPC.
 */

const build: Build = {
  id: undefined,
  base: '/',
  entry: { script: '/entry.js', styles: [], preloads: [] },
  views: null,
  head: [],
};
const host = { env: { WORD: 'Read:' } };
const worker = handler({ app: started, server, build });

let root: Root | undefined;
let redraw: ((app: Parameters<typeof client>[0]) => void) | undefined;
let errors: Array<unknown> = [];

beforeEach(() => {
  reset();
  registry.clear();
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    // The server and the browser drawing in one process, as only a test does.
    if (String(args[0]).includes('multiple renderers')) return;
    errors.push(args);
  });
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
    worker.fetch(new Request(new URL(input, location.href), init), host),
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Opens the page the server draws at `path`, as a browser would, and hydrates it. */
const open = async (path: string) => {
  history.replaceState(null, '', path);
  const html = await (
    await worker.fetch(new Request(new URL(path, location.href)), host)
  ).text();
  document.open();
  document.write(html);
  document.close();
  const drawn = document.body.innerHTML;
  await act(async () => {
    ({ root, redraw } = await client(started));
  });
  return drawn;
};

const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 100; tries++) {
    if (check()) return;
    await act(() => new Promise((done) => setTimeout(done, 5)));
  }
  throw new Error(`never: ${document.body.innerHTML}`);
};

describe('hydrating a page Start drew', () => {
  it('matches the server HTML, with no error, and does not load again', async () => {
    const drawn = await open('/blog/hello');
    await until(() => document.querySelector('h1')?.textContent === 'Hello');
    expect(errors).toEqual([]);
    expect(document.body.innerHTML).toBe(drawn);
    expect(runs.sort()).toEqual(['Blog', 'Blog.Post:hello']);
    expect(document.title).toBe('Hello');
  });

  it('keeps the data the server drew with: Back to the first page loads nothing again', async () => {
    await open('/blog/hello');
    await until(() => document.querySelector('h1')?.textContent === 'Hello');
    expect(runs.sort()).toEqual(['Blog', 'Blog.Post:hello']);

    // Away to another page, as a link the browser does not reload for…
    await act(async () => {
      history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await until(() => document.body.textContent!.includes('home'));
    // …and Back: the blog and its post are drawn from what the server drew.
    await act(async () => history.back());
    await until(() => document.querySelector('h1')?.textContent === 'Hello');
    expect(runs.sort()).toEqual(['Blog', 'Blog.Post:hello']);
    expect(errors).toEqual([]);
  });

  it('loads a client place through the Loader RPC once the Runtime starts', async () => {
    await open('/dashboard');
    expect(runs).toEqual(['Dashboard']);
    await until(() => document.body.textContent!.includes('visits'));
    expect(document.querySelector('#app')!.textContent).toBe(
      `${'/_kabuki/load'.length} visits`,
    );
    expect(errors).toEqual([]);
  });

  it('keeps what the server drew, and says so', async () => {
    const drawn = await open('/');
    await until(() => document.body.textContent!.includes('home'));
    expect(document.body.innerHTML).toBe(drawn);
    expect(document.querySelector('.stamp')!.textContent).toBe(
      'drawn by the server, dev',
    );
    expect(errors).toEqual([]);
  });

  it('keeps a client place with no data as the server drew it: it waited on nothing', async () => {
    const drawn = await open('/sketch');
    expect(drawn).toContain('the sketch');
    await until(() => document.querySelector('#sketch') !== null);
    expect(document.body.innerHTML).toBe(drawn);
    expect(errors).toEqual([]);
  });

  it('keeps a page the server drew failed, and loads nothing again', async () => {
    const drawn = await open('/blog/missing');
    await until(() => document.body.textContent!.includes('not found'));
    expect(document.body.innerHTML).toBe(drawn);
    expect(runs.sort()).toEqual(['Blog', 'Blog.Post:missing']);
    expect(errors).toEqual([]);
  });

  it('preloads the lazy Views the server drew before it hydrates', async () => {
    const drawn = await open('/lab');
    expect(
      document.querySelector('link[data-kabuki-view="src/lab.tsx"]'),
    ).not.toBeNull();
    expect(document.body.innerHTML).toBe(drawn);
    expect(document.body.textContent).toContain('the lab, loaded lazily');
    expect(errors).toEqual([]);
  });

  it('hands the Document the running app, and nothing outside Start', async () => {
    function Running() {
      const runtime = Start.useRuntime();
      return (
        <p id="runtime">
          {runtime ? `${runtime.running} ${runtime.branch.length > 0}` : 'none'}
        </p>
      );
    }
    expect(renderToString(<Running />)).toContain('none');
    await open('/blog/hello');
    await until(() => document.querySelector('h1')?.textContent === 'Hello');
    await act(async () =>
      redraw!(
        Start.app({
          router,
          view: AppView,
          document: ({ children }) => (
            <Document>
              <Running />
              {children}
            </Document>
          ),
        }),
      ),
    );
    await until(
      () => document.querySelector('#runtime')?.textContent === 'true true',
    );
    expect(errors).toEqual([]);
  });

  it('draws again with new code, as after a hot reload, and carries on', async () => {
    await open('/blog/hello');
    await until(() => document.querySelector('h1')?.textContent === 'Hello');
    await act(async () =>
      redraw!(
        Start.app({
          router,
          view: AppView,
          document: ({ children }) => (
            <Document>
              <p id="new">new code</p>
              {children}
            </Document>
          ),
        }),
      ),
    );
    await until(() => document.querySelector('#new') !== null);
    expect(document.querySelector('h1')!.textContent).toBe('Hello');
    expect(runs.sort()).toEqual(['Blog', 'Blog.Post:hello']);
    expect(errors).toEqual([]);
  });

  it('runs what the app attaches in the browser, and stops it when new code takes over', async () => {
    const seen: Array<string> = [];
    const attached = (code: string) =>
      Start.app({
        router,
        view: AppView,
        document: Document,
        attach: [
          (runtime) => {
            seen.push(`${code}: ${runtime.history.save().entries.length > 0}`);
            return () => seen.push(`${code}: stopped`);
          },
        ],
      });
    history.replaceState(null, '', '/');
    const html = await (
      await worker.fetch(new Request(new URL('/', location.href)), host)
    ).text();
    document.open();
    document.write(html);
    document.close();
    await act(async () => {
      ({ root, redraw } = await client(attached('old')));
    });
    await until(() => document.body.textContent!.includes('home'));
    expect(seen).toEqual(['old: true']);
    await act(async () => redraw!(attached('new')));
    await until(() => seen.length === 3);
    expect(seen).toEqual(['old: true', 'old: stopped', 'new: true']);
    expect(errors).toEqual([]);
  });

  it('calls the app by the name it was given, else by its root Actor', async () => {
    const named: Array<string> = [];
    const app = (name?: string) =>
      Start.app({
        router,
        view: AppView,
        document: Document,
        ...(name ? { name } : {}),
        attach: [
          (runtime) => {
            named.push(runtime.name);
            return () => {};
          },
        ],
      });
    history.replaceState(null, '', '/');
    const html = await (
      await worker.fetch(new Request(new URL('/', location.href)), host)
    ).text();
    document.open();
    document.write(html);
    document.close();
    await act(async () => {
      ({ root, redraw } = await client(app('blog')));
    });
    await until(() => named.length === 1);
    await act(async () => root?.unmount());
    registry.clear();
    document.open();
    document.write(html);
    document.close();
    await act(async () => {
      ({ root, redraw } = await client(app()));
    });
    await until(() => named.length === 2);
    expect(named).toEqual(['blog', 'Router']);
    expect(errors).toEqual([]);
  });
});

describe('the App Shell', () => {
  /** Opens the App Shell at `path`, as a service worker answers a page with it, and hydrates it. */
  const openShell = async (path: string) => {
    history.replaceState(null, '', path);
    const html = await (
      await worker.fetch(
        new Request(new URL('/_kabuki/shell', location.href)),
        host,
      )
    ).text();
    document.open();
    document.write(html);
    document.close();
    await act(async () => {
      ({ root, redraw } = await client(started));
    });
  };

  it('draws the app at its own URL, every place loading, with no error', async () => {
    await openShell('/blog/hello');
    await until(() => document.querySelector('h1')?.textContent === 'Hello');
    expect(runs.sort()).toEqual(['Blog', 'Blog.Post:hello']);
    expect(errors).toEqual([]);
  });

  it('draws a client page as the page itself would', async () => {
    await openShell('/dashboard');
    await until(() => document.body.textContent!.includes('visits'));
    expect(runs).toEqual(['Dashboard']);
    expect(errors).toEqual([]);
  });
});
