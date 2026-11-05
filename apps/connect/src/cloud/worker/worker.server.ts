import { Schema } from 'effect';
import { Release } from '../../contract/index.ts';
import { serve } from './worker.ts';

/*
 * Connect Cloud's Worker: Connect Cloud over the Worker's D1 database, signing
 * in through the Auth Worker at `AUTH_URL`, letting pages on the origins
 * `ALLOWED_ORIGINS` names (comma-separated patterns, see contract/) call with
 * credentials, telling every Connection to run the Releases `RELEASES` names
 * (JSON, `{"code":{"hash":"…","url":"…"}}`, the latest of each Plugin; none when
 * it is empty) and that the Minimum Connect is `MIN_CONNECT`, and serving
 * Release Files from the R2 bucket `RELEASE_FILES`, where a Release that is not
 * the latest is looked for.
 */

/** What this Worker is handed by Alchemy. */
interface Env {
  readonly AUTH_URL: string;
  readonly ALLOWED_ORIGINS: string;
  readonly RELEASES?: string;
  readonly MIN_CONNECT?: string;
  readonly DB: D1Database;
  readonly RELEASE_FILES?: R2Bucket;
}

const Releases = Schema.fromJsonString(Schema.Record(Schema.String, Release));

let served: ((request: Request) => Promise<Response>) | undefined;

const make = (env: Env) => {
  if (!env.AUTH_URL || !env.ALLOWED_ORIGINS) {
    throw new Error('Connect Cloud needs AUTH_URL and ALLOWED_ORIGINS');
  }
  return serve({
    auth: { url: env.AUTH_URL },
    origins: env.ALLOWED_ORIGINS.split(','),
    database: env.DB,
    wanted: env.RELEASES
      ? Schema.decodeUnknownSync(Releases)(env.RELEASES)
      : {},
    ...(env.MIN_CONNECT ? { minConnect: env.MIN_CONNECT } : {}),
    ...(env.RELEASE_FILES === undefined ? {} : { files: env.RELEASE_FILES }),
  });
};

export default {
  fetch: (request: Request, env: Env) => (served ??= make(env))(request),
};
