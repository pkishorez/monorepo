import { readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBuilder, createServer } from 'vite';
import type { InlineConfig } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { start } from '../vite/index.ts';

/*
 * The Vite plugin on the fixture app, which writes no entry: a real build,
 * whose Worker is then run in Node, and a dev server drawing pages.
 */

const root = fileURLToPath(new URL('./app', import.meta.url));
const source = fileURLToPath(new URL('../..', import.meta.url));
// Inside the package, so the built Worker finds React and Effect.
const out = fileURLToPath(
  new URL('../../../node_modules/.kabuki-start-test', import.meta.url),
);

const config = (outDir: string, at = root): InlineConfig => ({
  root: at,
  configFile: false,
  logLevel: 'warn',
  resolve: {
    alias: [
      {
        find: /^@kestack\/kabuki\/start\/(server|client)$/,
        replacement: `${source}/start/$1/index.ts`,
      },
      {
        find: /^@kestack\/kabuki\/start$/,
        replacement: `${source}/start/document/index.ts`,
      },
    ],
  },
  environments: {
    client: { build: { outDir: path.join(outDir, 'client') } },
    ssr: { build: { outDir: path.join(outDir, 'server') } },
  },
  plugins: [start()],
});

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('vite build', () => {
  const built = (async () => {
    const builder = await createBuilder(config(out));
    await builder.buildApp();
    const worker = (
      (await import(
        pathToFileURL(path.join(out, 'server', 'index.js')).href
      )) as {
        readonly default: {
          readonly fetch: (request: Request, env: unknown) => Promise<Response>;
        };
      }
    ).default;
    return (url: string, init?: RequestInit) =>
      worker.fetch(new Request(`https://site.test${url}`, init), {});
  })();

  it('builds the client and a Worker that draws pages, with no entry written by the app', async () => {
    const fetch = await built;
    const response = await fetch('/blog/hello');
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('Read: Hello');
    const script = /<script type="module" src="(\/assets\/[^"]+\.js)">/.exec(
      html,
    )?.[1];
    expect(script).toBeDefined();
    expect(readdirSync(path.join(out, 'client', 'assets'))).toContain(
      path.basename(script!),
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=31536000',
    );
    // The app's styles are linked in the head, so nothing is painted bare.
    const style =
      /<link rel="stylesheet" href="(\/assets\/[^"]+\.css)"\/?>/.exec(
        html.slice(0, html.indexOf('</head>')),
      )?.[1];
    expect(
      readFileSync(path.join(out, 'client', style!.slice(1)), 'utf8'),
    ).toContain('.stamp');
  }, 60_000);

  it('names each lazy View by its module, and preloads its chunk and styles', async () => {
    const fetch = await built;
    const html = await (await fetch('/gallery')).text();
    expect(html).toContain('the gallery, loaded lazily');
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toMatch(
      /<link rel="modulepreload" href="\/assets\/gallery-[^"]+\.js" data-kabuki-view="src\/gallery\.tsx">/,
    );
    expect(head).toMatch(
      /<link rel="stylesheet" href="\/assets\/gallery-[^"]+\.css">/,
    );
  }, 60_000);

  it('builds the Worker as one module that carries its dependencies and exports only its handler', async () => {
    await built;
    expect(readdirSync(path.join(out, 'server'))).toEqual(['index.js']);
    const code = readFileSync(path.join(out, 'server', 'index.js'), 'utf8');
    expect(code).not.toMatch(/^import .* from ['"](?!node:)/m);
    expect(code).not.toContain('createRequire');
    expect(code.trimEnd()).toMatch(/export \{ \w+ as default \};$/);
  }, 60_000);

  it('does not deploy the manifest it hands the Worker', async () => {
    await built;
    expect(() =>
      readFileSync(path.join(out, 'client', '.vite', 'kabuki-start.json')),
    ).toThrow();
  }, 60_000);

  it('serves the Loader RPC', async () => {
    const fetch = await built;
    const response = await fetch('/_kabuki/load', {
      method: 'POST',
      body: JSON.stringify({ places: [{ name: 'Dashboard', params: {} }] }),
    });
    expect(await response.json()).toEqual({
      _tag: 'Loaded',
      inputs: { Dashboard: { visits: '/_kabuki/load'.length } },
    });
  }, 60_000);
});

describe('vite dev', () => {
  it('draws pages through the same Worker, with Vite’s client and the browser entry', async () => {
    const server = await createServer({
      ...config(path.join(out, 'dev')),
      server: { port: 0, host: '127.0.0.1' },
    });
    await server.listen();
    try {
      const at = server.resolvedUrls!.local[0]!;
      const response = await fetch(new URL('/blog/hello', at));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<h1>Hello</h1>');
      expect(html).toContain('<script type="module" src="/@vite/client">');
      const entry = '/@id/__x00__virtual:kabuki-start/client';
      expect(html).toContain(`<script type="module" src="${entry}">`);
      const client = await fetch(new URL(entry, at));
      expect(client.status).toBe(200);
      const code = await client.text();
      expect(code).toContain('client(');
      // A new app is drawn again from its History, not a full reload.
      expect(code).toContain('import.meta.hot.accept(');
      // The app's styles, linked in the head, as plain CSS the browser waits for.
      expect(html.slice(0, html.indexOf('</head>'))).toContain(
        '<link rel="stylesheet" href="/@kabuki-start/styles.css"/>',
      );
      const styles = await fetch(new URL('/@kabuki-start/styles.css', at));
      expect(styles.headers.get('content-type')).toBe('text/css');
      // Only what the app's scripts import: a stylesheet carries its own imports.
      const text = await styles.text();
      expect(text).toBe('@import url("/src/app.css?direct");');
      const imported = '/src/app.css?direct';
      const css = await fetch(new URL(imported!, at));
      expect(css.headers.get('content-type')).toContain('text/css');
      const served = await css.text();
      expect(served).toContain('font-style: italic');
      expect(served).toContain('font-weight: bold');
      // Turned off once the app's own scripts have added them.
      expect(code).toContain('link.sheet.disabled = true');
      const lab = await (await fetch(new URL('/gallery', at))).text();
      expect(lab).toContain(
        '<link rel="modulepreload" href="/src/gallery.tsx" data-kabuki-view="src/gallery.tsx">',
      );
    } finally {
      await server.close();
    }
  }, 60_000);
});

describe('a Worker environment that finds its own dependencies', () => {
  it('scans the app’s server files, which its entry imports, and Start’s', async () => {
    const plugin = start();
    const hooks = plugin as unknown as {
      readonly config: {
        readonly handler: (config: object, env: object) => unknown;
      };
      readonly configEnvironment: (
        name: string,
        config: object,
      ) => { readonly optimizeDeps: { readonly entries: Array<string> } };
    };
    hooks.config.handler.call({ meta: {} }, { root }, { command: 'serve' });
    // As workerd under the Cloudflare plugin.
    const worker = hooks.configEnvironment('ssr', {
      optimizeDeps: { noDiscovery: false },
    });
    expect(
      worker.optimizeDeps.entries.map((file) => path.relative(root, file)),
    ).toEqual([
      'src/app.tsx',
      'src/document.tsx',
      'src/loaders.server.ts',
      'src/layer.server.ts',
    ]);
    // Vite's own server environment, in Node, and the browser: left as they are.
    expect(hooks.configEnvironment('ssr', {})).toBeUndefined();
    expect(
      hooks.configEnvironment('client', {
        optimizeDeps: { noDiscovery: false },
      }),
    ).toBeUndefined();
  });
});

describe('an app with no Document', () => {
  it('is drawn in the plainest one, with Start’s parts in it', async () => {
    const server = await createServer({
      ...config(
        path.join(out, 'bare'),
        fileURLToPath(new URL('./bare', import.meta.url)),
      ),
      server: { port: 0, host: '127.0.0.1' },
    });
    await server.listen();
    try {
      const html = await (
        await fetch(new URL('/', server.resolvedUrls!.local[0]!))
      ).text();
      expect(html).toMatch(
        /^<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"\/>/,
      );
      expect(html).toContain('<title>Home</title>');
      expect(html).toContain('<p>home</p>');
      expect(html).toContain('id="kabuki-start"');
    } finally {
      await server.close();
    }
  }, 60_000);
});
