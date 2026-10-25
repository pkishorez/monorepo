import { serve } from '../serve/index.ts';

/*
 * Cloud Connect's Worker: Cloud Connect over the Worker's D1 database,
 * signing in through the Auth Worker at `AUTH_URL`, and letting pages on
 * the origins `ALLOWED_ORIGINS` names (comma-separated patterns, see
 * cloud/origins) call with credentials.
 */

/** What this Worker is handed by Alchemy. */
interface Env {
  readonly AUTH_URL: string;
  readonly ALLOWED_ORIGINS: string;
  readonly DB: D1Database;
}

let served: ((request: Request) => Promise<Response>) | undefined;

const make = (env: Env) => {
  if (!env.AUTH_URL || !env.ALLOWED_ORIGINS) {
    throw new Error('Cloud Connect needs AUTH_URL and ALLOWED_ORIGINS');
  }
  return serve({
    auth: { url: env.AUTH_URL },
    origins: env.ALLOWED_ORIGINS.split(','),
    database: env.DB,
  });
};

export default {
  fetch: (request: Request, env: Env) => (served ??= make(env))(request),
};
