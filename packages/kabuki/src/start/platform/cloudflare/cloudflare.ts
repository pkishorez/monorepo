import type { Handler, PageCache, Platform } from '../index.ts';

/*
 * Start on Cloudflare Workers. `cloudflare()` is what the Vite plugin
 * builds for: one module, its dependencies in their edge form, which
 * Alchemy's `Cloudflare.Website.Vite` deploys in front of the client's
 * assets. `serve(handler)` is the Worker: each request handed to Start with
 * the Worker's env and the Cloudflare Cache.
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
  serve: { from: '@kestack/kabuki/start/platform/cloudflare', name: 'serve' },
});

/** The Cloudflare Cache of this data center; none outside workerd, as in Node. */
const theCache = (): PageCache | undefined =>
  (globalThis as { readonly caches?: { readonly default?: PageCache } }).caches
    ?.default;

/** Start's handler as a Worker's: what the Worker's main default-exports. */
export const serve = (handler: Handler) => ({
  fetch: (request: Request, env: unknown): Promise<Response> => {
    const cache = theCache();
    return handler.fetch(request, cache ? { env, cache } : { env });
  },
});
