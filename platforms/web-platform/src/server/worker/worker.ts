import handler from '@tanstack/react-start/server-entry';

/** Answers a request with the platform's own context, such as a Worker's
 * `env`. */
export type Handle<Env> = (request: Request, env: Env) => Promise<Response>;

/**
 * A web app's server: what `route` answers, and everything else the app's
 * pages, from TanStack Start. `rpc` answers `/rpc` alone. A plain fetch
 * handler, so it is a Cloudflare Worker's default export as it is, and runs
 * anywhere else that calls `fetch(request, env)`.
 */
export const webServer = <Env>(options: {
  readonly rpc?: Handle<Env>;
  /** Answers a request it knows, or null to leave it to the pages. */
  readonly route?: (request: Request, env: Env) => Promise<Response> | null;
}) => ({
  fetch: (request: Request, env: Env): Promise<Response> => {
    const routed = options.route?.(request, env) ?? null;
    if (routed !== null) return routed;
    const path = new URL(request.url).pathname;
    return options.rpc !== undefined && (path === '/rpc' || path === '/rpc/')
      ? options.rpc(request, env)
      : Promise.resolve(handler.fetch(request));
  },
});
