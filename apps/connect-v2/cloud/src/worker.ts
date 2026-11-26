import { Schema } from 'effect';
import { Release } from './server/rpc/heartbeat/contract/index.js';
import { serve } from './server/index.js';

interface Env {
  readonly AUTH_URL: string;
  readonly ALLOWED_ORIGINS: string;
  readonly CATALOG?: string;
  readonly MIN_CONNECT?: string;
  readonly DB: D1Database;
  readonly RELEASE_FILES?: R2Bucket;
}

const CatalogJson = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Struct({ ...Release.fields, enabledByDefault: Schema.Boolean }),
  ),
);

let served: ((request: Request) => Promise<Response>) | undefined;

const make = (env: Env) => {
  if (!env.AUTH_URL || !env.ALLOWED_ORIGINS) {
    throw new Error('Connect Cloud needs AUTH_URL and ALLOWED_ORIGINS');
  }
  return serve({
    auth: { url: env.AUTH_URL },
    origins: env.ALLOWED_ORIGINS.split(','),
    database: env.DB,
    catalog: env.CATALOG
      ? Schema.decodeUnknownSync(CatalogJson)(env.CATALOG)
      : {},
    ...(env.MIN_CONNECT ? { minConnect: env.MIN_CONNECT } : {}),
    ...(env.RELEASE_FILES === undefined ? {} : { files: env.RELEASE_FILES }),
  });
};

export default {
  fetch: (request: Request, env: Env) => (served ??= make(env))(request),
};
