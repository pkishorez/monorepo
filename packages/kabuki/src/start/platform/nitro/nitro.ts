import type { Handler, Platform } from '../index.ts';

/*
 * Start on whatever Nitro builds for: Node, Bun, Deno, Vercel, Netlify,
 * AWS Lambda and the rest, by its preset. `nitro()` is what the Vite plugin
 * builds for: the server's entry, which Nitro's own Vite plugin takes as
 * its SSR service and wraps in the preset's server, beside the client's
 * assets, which Nitro serves. `serve(handler)` is that entry: each request
 * handed to Start with the process's env and no Cache, so a static page is
 * kept by the CDN in front, by its Cache-Control, where there is one.
 */

/** Any Nitro preset, for `start({ platform: nitro() })` beside Nitro's `nitro()`. */
export const nitro = (): Platform => ({
  name: 'nitro',
  conditions: ['node', 'import', 'module', 'default'],
  serve: { from: '@kestack/kabuki/start/platform/nitro', name: 'serve' },
});

/** Start's handler as Nitro's SSR entry: what the server's entry default-exports. */
export const serve = (handler: Handler) => ({
  fetch: (request: Request): Promise<Response> =>
    handler.fetch(request, { env: process.env }),
});
