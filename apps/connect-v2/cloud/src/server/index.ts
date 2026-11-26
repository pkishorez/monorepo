import { Effect, Layer, Schema } from 'effect';
import { auth, type AuthOptions } from '@kestack/auth-toolkit/server';
import { server } from '@kestack/rpc-toolkit/rpc/http';
import type { SQLiteDriver } from '@kestack/std-toolkit/db/sqlite';
import {
  type D1SQLiteConfig,
  type D1Statement,
  makeD1SQLite,
} from '@kestack/std-toolkit/db/sqlite/d1';
import {
  AUTH_PATH,
  AuthInfo,
  HEARTBEAT_PATH,
  HeartbeatApi,
  outdatedLine,
  RELEASE_PATH,
  UPGRADE_REQUIRED,
  VERSION_HEADER,
} from './rpc/heartbeat/contract/index.js';
import { AppApi, allowsOrigin, RPC_PATH } from './rpc/app/contract/index.js';
import { appHandlers } from './rpc/app/real/index.js';
import { heartbeatHandlers } from './rpc/heartbeat/real/index.js';
import { Catalog as CatalogService } from './services/catalog/contract/index.js';
import type {
  CatalogEntries,
  ReleaseFiles,
} from './services/catalog/contract/index.js';
import { catalogLayer } from './services/catalog/real/index.js';
import {
  connectionsLayer,
  connectionsTable,
} from './services/connections/real/index.js';

export type Catalog = CatalogEntries;

export type { ReleaseFiles };

export { connectionsTable };

const RELEASE_FILE = /^\/([^/]+)\/([^/]+)\.mjs$/;

const IMMUTABLE = 'public, max-age=31536000, immutable';

const notFound = () => new Response('Not found', { status: 404 });

const forbidden = (headers: Record<string, string> = {}) =>
  new Response('Forbidden', { status: 403, headers });

const corsFor = (request: Request, origin: string): Record<string, string> => ({
  'access-control-allow-origin': origin,
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'POST',
  'access-control-allow-headers':
    request.headers.get('access-control-request-headers') ?? '',
  'access-control-max-age': '600',
  vary: 'Origin',
});

export const serveOver = (options: {
  readonly guard: ReturnType<typeof auth.rpc>;
  readonly authInfo: AuthInfo;
  readonly origins: ReadonlyArray<string>;
  readonly driver: SQLiteDriver;
  readonly catalog?: Catalog;
  readonly minConnect?: string;
  readonly files?: ReleaseFiles;
}) => {
  const minConnect = options.minConnect ?? null;
  const catalog = catalogLayer({
    catalog: options.catalog ?? {},
    files: options.files,
  });
  const services = Layer.mergeAll(catalog, connectionsLayer(options.driver));
  const heartbeat = server(
    HeartbeatApi,
    Layer.mergeAll(
      heartbeatHandlers.pipe(Layer.provide(services)),
      options.guard,
    ),
  );
  const app = server(
    AppApi,
    Layer.mergeAll(
      appHandlers(minConnect).pipe(Layer.provide(services)),
      options.guard,
    ),
  );
  const allowed = allowsOrigin(options.origins);
  const authBody = JSON.stringify(
    Schema.encodeSync(AuthInfo.schema)(options.authInfo),
  );

  const releaseFile = async (path: string) => {
    const named = RELEASE_FILE.exec(path);
    if (named === null) return notFound();
    const body = await Effect.runPromise(
      Effect.gen(function* () {
        const files = yield* CatalogService;
        return yield* files.file(named[1]!, named[2]!);
      }).pipe(Effect.provide(catalog)),
    );
    return body === null
      ? notFound()
      : new Response(body, {
          headers: {
            'content-type': 'text/javascript; charset=utf-8',
            'cache-control': IMMUTABLE,
            'access-control-allow-origin': '*',
          },
        });
  };

  const heartbeatCall = (request: Request) => {
    if (request.headers.get('origin') !== null) return forbidden();
    const outdated = outdatedLine(
      request.headers.get(VERSION_HEADER),
      minConnect,
    );
    return outdated === null
      ? heartbeat(request)
      : new Response(outdated, {
          status: UPGRADE_REQUIRED,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
  };

  const appCall = async (request: Request) => {
    const origin = request.headers.get('origin');
    if (origin !== null && !allowed(origin))
      return forbidden({ vary: 'Origin' });
    const cors: Record<string, string> =
      origin === null ? { vary: 'Origin' } : corsFor(request, origin);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    const response = await app(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  };

  return async (request: Request): Promise<Response> => {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
    if (pathname === AUTH_PATH && request.method === 'GET')
      return new Response(authBody, {
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        },
      });
    if (pathname.startsWith(`${RELEASE_PATH}/`) && request.method === 'GET')
      return releaseFile(pathname.slice(RELEASE_PATH.length));
    if (pathname === HEARTBEAT_PATH) return heartbeatCall(request);
    if (pathname === RPC_PATH) return appCall(request);
    return notFound();
  };
};

export const serve = <Statement extends D1Statement<Statement>>(options: {
  readonly auth: AuthOptions;
  readonly origins: ReadonlyArray<string>;
  readonly database: D1SQLiteConfig<Statement>['database'];
  readonly catalog?: Catalog;
  readonly minConnect?: string;
  readonly files?: ReleaseFiles;
}) => {
  const { auth: authOptions, database, ...rest } = options;
  return serveOver({
    ...rest,
    guard: auth.rpc(authOptions),
    authInfo: { url: authOptions.url },
    driver: makeD1SQLite({ database }),
  });
};
