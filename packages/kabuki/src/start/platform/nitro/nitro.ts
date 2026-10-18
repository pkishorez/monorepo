import type { Handler, PageCache, Platform } from '../index.ts';

/*
 * Start on whatever Nitro builds for: Cloudflare, Vercel, Node, Bun,
 * Netlify, AWS Lambda and the rest, by the preset `nitro({ preset })`
 * names. The Vite plugin builds the server's entry, which Nitro's own
 * plugin, beside it as a plain `nitro()`, takes as its SSR service and
 * wraps in the preset's server, beside the client's assets, which Nitro
 * serves. The preset reaches Nitro through the Vite config's `nitro` key.
 *
 * `serve(handler)` is that entry: each request handed to Start with the
 * platform's env, a Worker's bindings on Cloudflare and the process's
 * elsewhere, and the Cloudflare Cache where there is one; with none, a
 * static page is kept by the CDN in front, by its Cache-Control.
 */

/** Where Nitro builds the server for. */
export interface NitroOptions {
  /** Nitro's preset, as its docs name it: `cloudflare_module`, `vercel`, `node_server`, `bun`, `aws_lambda`, … */
  readonly preset: string;
}

/** Whether a preset runs the server in workerd, which resolves dependencies in their edge form. */
const onWorkerd = (preset: string) => preset.startsWith('cloudflare');

/** Any Nitro preset, for `start({ platform: nitro({ preset }) })` beside Nitro's own `nitro()`. */
export const nitro = ({ preset }: NitroOptions): Platform => ({
  name: `nitro:${preset}`,
  conditions: onWorkerd(preset)
    ? [
        'workerd',
        'worker',
        'edge-light',
        'module',
        'browser',
        'import',
        'default',
      ]
    : ['node', 'import', 'module', 'default'],
  serve: { from: '@kestack/kabuki/start/platform/nitro', name: 'serve' },
  config: { nitro: { preset } },
});

/** What Nitro's Cloudflare presets put on a request: the Worker's env. */
interface OnCloudflare {
  readonly runtime?: { readonly cloudflare?: { readonly env?: unknown } };
}

/** The Cloudflare Cache of this data center; none outside workerd. */
const theCache = (): PageCache | undefined =>
  (globalThis as { readonly caches?: { readonly default?: PageCache } }).caches
    ?.default;

/** Start's handler as Nitro's SSR entry: what the server's entry default-exports. */
export const serve = (handler: Handler) => ({
  fetch: (request: Request): Promise<Response> => {
    const env =
      (request as OnCloudflare).runtime?.cloudflare?.env ?? process.env;
    const cache = theCache();
    return handler.fetch(request, cache ? { env, cache } : { env });
  },
});
