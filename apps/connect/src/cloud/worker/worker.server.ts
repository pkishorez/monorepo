import { Schema } from 'effect';
import { serve } from './worker.ts';

/*
 * Cloud Connect's Worker: Cloud Connect over the Worker's D1 database,
 * signing in through the Auth Worker at `AUTH_URL`, letting pages on the
 * origins `ALLOWED_ORIGINS` names (comma-separated patterns, see
 * cloud/contract) call with credentials, and telling every Connection to
 * run the Plugins `PLUGINS` names: JSON, `{"code":{"hash":"…","url":"…"}}`;
 * none when it is empty.
 */

/** What this Worker is handed by Alchemy. */
interface Env {
  readonly AUTH_URL: string;
  readonly ALLOWED_ORIGINS: string;
  readonly PLUGINS?: string;
  readonly DB: D1Database;
}

const Plugins = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Struct({ hash: Schema.String, url: Schema.String }),
  ),
);

let served: ((request: Request) => Promise<Response>) | undefined;

const make = (env: Env) => {
  if (!env.AUTH_URL || !env.ALLOWED_ORIGINS) {
    throw new Error('Cloud Connect needs AUTH_URL and ALLOWED_ORIGINS');
  }
  return serve({
    auth: { url: env.AUTH_URL },
    origins: env.ALLOWED_ORIGINS.split(','),
    database: env.DB,
    plugins: env.PLUGINS ? Schema.decodeUnknownSync(Plugins)(env.PLUGINS) : {},
  });
};

export default {
  fetch: (request: Request, env: Env) => (served ??= make(env))(request),
};
