import type { Handler, Host, PageCache, Platform } from '../index.ts';

/*
 * Start on Cloudflare Workers. `cloudflare()` is what the Vite plugin
 * builds for: one module, its dependencies in their edge form, which
 * Alchemy's `Cloudflare.Website.Vite` deploys in front of the client's
 * assets. Those assets answer a URL that names a file before the Worker is
 * asked, `/blog/hello` from `blog/hello.html`, so a static page the build
 * drew never reaches it. `serve(handler)` is the Worker: each request
 * handed to Start with the Worker's env, the Cloudflare Cache, and the
 * assets, where it reads the Static Data.
 */

/** Cloudflare Workers, for `start({ platform: cloudflare() })`. */
export const cloudflare = (): Platform => ({
  name: 'cloudflare',
  conditions: [
    'workerd',
    'worker',
    'edge-light',
    'module',
    'browser',
    'import',
    'default',
  ],
  serve: { from: '@kestack/kabuki/start/server', name: 'serveCloudflare' },
  // A build's Static Data is under its build id, so a file there never changes.
  files: ({ data }) => ({
    _headers: `${data}/*\n  Cache-Control: public, max-age=31536000, immutable`,
  }),
});

/** The Cloudflare Cache of this data center; none outside workerd, as in Node. */
const theCache = (): PageCache | undefined =>
  (globalThis as { readonly caches?: { readonly default?: PageCache } }).caches
    ?.default;

/** A Worker's assets, as its `ASSETS` binding: the client's files, and what the build wrote beside them. */
interface Assets {
  readonly fetch: (request: Request) => Promise<Response>;
}

/** The files the build wrote, read from the Worker's assets; none on a Worker with no assets. */
const theFiles = (env: unknown, request: Request): Host['files'] => {
  const assets = (env as { readonly ASSETS?: Assets } | null | undefined)
    ?.ASSETS;
  if (typeof assets?.fetch !== 'function') return undefined;
  return async (path) => {
    const response = await assets.fetch(
      new Request(new URL(path, request.url)),
    );
    return response.ok ? response : undefined;
  };
};

/** Start's handler as a Worker's: what the Worker's main default-exports. */
export const serve = (handler: Handler) => ({
  fetch: (request: Request, env: unknown): Promise<Response> => {
    const cache = theCache();
    const files = theFiles(env, request);
    return handler.fetch(request, {
      env,
      ...(cache && { cache }),
      ...(files && { files }),
    });
  },
});
