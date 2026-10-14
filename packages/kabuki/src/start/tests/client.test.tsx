// @vitest-environment jsdom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from '../../react/registry.ts';
import { client } from '../client/index.ts';
import type { Build } from '../common/index.ts';
import { server } from '../server/index.ts';
import { Start } from '../common/index.ts';
import started, { app } from './app/src/app.tsx';
import Document from './app/src/document.tsx';
import served, { reset, runs } from './app/src/loaders.server.ts';

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
const worker = server({ app: started, loaders: served, build });

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

  it('draws again with new code, as after a hot reload, and carries on', async () => {
    await open('/blog/hello');
    await until(() => document.querySelector('h1')?.textContent === 'Hello');
    await act(async () =>
      redraw!(
        Start.app(app, {
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
});
