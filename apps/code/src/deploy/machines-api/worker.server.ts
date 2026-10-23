import { serve } from '@kestack/ai-toolkit/machines/backend';

/*
 * The Machines Worker: the Machines Backend over the Worker's D1 database,
 * signing in through the Auth Worker at `AUTH_URL`, or by name in Local
 * mode when `AUTH_LOCAL` is `'true'` (only ever under `alchemy dev`), and
 * letting the site at `SITE_ORIGIN` call with credentials.
 */

/** What this Worker is handed by Alchemy. */
interface Env {
  readonly AUTH_URL?: string;
  readonly AUTH_LOCAL?: string;
  readonly SITE_ORIGIN: string;
  readonly DB: D1Database;
}

let served: ((request: Request) => Promise<Response>) | undefined;

const make = (env: Env) => {
  if (env.AUTH_LOCAL !== 'true' && !env.AUTH_URL) {
    throw new Error('The Machines Worker needs AUTH_URL or AUTH_LOCAL=true');
  }
  return serve({
    auth:
      env.AUTH_LOCAL === 'true'
        ? { local: true }
        : { url: env.AUTH_URL as string },
    site: env.SITE_ORIGIN,
    database: env.DB,
  });
};

export default {
  fetch: (request: Request, env: Env) => (served ??= make(env))(request),
};
