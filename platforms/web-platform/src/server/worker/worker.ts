import handler from '@tanstack/react-start/server-entry';

/** Answers a request with the platform's own context, such as a Worker's
 * `env`. */
export type Handle<Env> = (request: Request, env: Env) => Promise<Response>;

/**
 * A web app's server: `/rpc` goes to `rpc`, the app's API; everything else
 * is the app's pages, from TanStack Start. A plain fetch handler, so it is a
 * Cloudflare Worker's default export as it is, and runs anywhere else that
 * calls `fetch(request, env)`.
 */
export const webServer = <Env>(options: { readonly rpc?: Handle<Env> }) => ({
  fetch: (request: Request, env: Env): Promise<Response> => {
    const path = new URL(request.url).pathname;
    return options.rpc !== undefined && (path === '/rpc' || path === '/rpc/')
      ? options.rpc(request, env)
      : Promise.resolve(handler.fetch(request));
  },
});
