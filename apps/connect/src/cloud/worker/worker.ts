import { Effect, Layer, Schema } from 'effect';
import { Authz } from '@kestack/auth-toolkit';
import { auth, type AuthOptions } from '@kestack/auth-toolkit/server';
import { server } from '@kestack/rpc-toolkit/rpc/http';
import { SQLite, type SQLiteDriver } from '@kestack/std-toolkit/db/sqlite';
import {
  type D1SQLiteConfig,
  type D1Statement,
  makeD1SQLite,
} from '@kestack/std-toolkit/db/sqlite/d1';
import {
  allowsOrigin,
  AUTH_PATH,
  AuthInfo,
  CloudApi,
  fromShelfKey,
  RPC_PATH,
  SHELF_PATH,
} from '../contract/index.js';
import { Registry, type Deployment, type Wanted } from './registry/index.js';
import { connectionsTable } from './storage/index.js';

/*
 * Cloud Connect: `CloudApi` for the signed-in caller over the `connections`
 * table, as one `(request) => Promise<Response>`.
 *
 * - `GET /auth` answers the AuthInfo it was given, to anyone: how a Connection
 *   signs in here.
 * - `POST /rpc` is the RPC. The caller is checked by auth-toolkit's Guard,
 *   asking the Auth Worker; a call with no Sign-in is refused
 *   Unauthenticated. Every Connection is told `plugins`, the latest
 *   Release of each Plugin, none unless given, and `minConnect`, the
 *   Minimum Connect, null unless given.
 * - `GET /plugins/<name>/<sha256>.mjs` answers that Release's file from
 *   `files`, the Shelf in R2, to anyone, cached for good: a file is named
 *   by its hash, so it never changes. Anything else there, or no `files`,
 *   is 404.
 * - Apps are on other origins of the same site: an origin matching one of
 *   `origins` (patterns, see cloud/contract) may call `/rpc` with credentials,
 *   its own origin echoed back, and its preflight is answered here, since
 *   the RPC server answers POST alone. A call from any other origin is
 *   refused 403 before it is read: another page of the same site would send
 *   the User's cookie with a simple POST. A call with no Origin, as `serve`
 *   makes, is no browser's and goes ahead.
 *
 * The Worker is a few lines over `serve`, reading its env (see
 * worker.server.ts). The table itself is made at deploy, by
 * `D1.table(connectionsTable)`.
 */

/** The Shelf, where the Plugins' files are kept: an R2 bucket, or anything that answers `get` alike, by the path it is served at. */
export interface PluginFiles {
  readonly get: (
    key: string,
  ) => Promise<{ readonly body: ReadableStream | null } | null>;
}

/** A Plugin's file never changes: its name is its hash. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** Answers `GET /plugins/<name>/<sha256>.mjs` from `files`; 404 for anything else. */
const pluginFile = async (
  pathname: string,
  files: PluginFiles | undefined,
): Promise<Response> => {
  const notFound = () => new Response('Not found', { status: 404 });
  const key = pathname.slice(SHELF_PATH.length + 1);
  if (files === undefined || fromShelfKey(key) === null) return notFound();
  const found = await files.get(pathname.slice(1));
  if (found === null || found.body === null) return notFound();
  return new Response(found.body, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': IMMUTABLE,
      'access-control-allow-origin': '*',
    },
  });
};

/** The calls' handlers, telling every Connection the `deployment`. */
const handlers = (deployment: Deployment) =>
  CloudApi.toLayer({
    Report: (input) =>
      Effect.flatMap(Authz.User, (principal) =>
        Registry.report(principal, input, deployment),
      ),
    List: () =>
      Effect.flatMap(Authz.User, (principal) =>
        Registry.list(principal, deployment),
      ),
    Forget: ({ id }) =>
      Effect.flatMap(Authz.User, (principal) => Registry.forget(principal, id)),
  });

/** The CORS headers for a request from `origin`, an allowed one. */
const corsFor = (request: Request, origin: string): Record<string, string> => ({
  'access-control-allow-origin': origin,
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'POST',
  'access-control-allow-headers':
    request.headers.get('access-control-request-headers') ?? '',
  'access-control-max-age': '600',
  vary: 'Origin',
});

/**
 * Answers requests over the `connections` table on `driver`, with `guard`
 * telling who calls and `authInfo` what `/auth` answers, letting pages on
 * `origins` call with credentials. For a test (`fakeGuard.rpc({ as })`) or
 * a local SQLite file; a Worker uses {@link serve}. The table must be set
 * up already.
 */
export const serveOver = (options: {
  readonly guard: ReturnType<typeof auth.rpc>;
  readonly authInfo: AuthInfo;
  readonly origins: ReadonlyArray<string>;
  readonly driver: SQLiteDriver;
  /** The physical name the table was set up under; its logical name by default. */
  readonly tableName?: string;
  readonly plugins?: Wanted;
  readonly minConnect?: string;
  readonly files?: PluginFiles;
}) => {
  const table = SQLite.make(connectionsTable, {
    database: options.driver,
    ...(options.tableName === undefined
      ? {}
      : { tableName: options.tableName }),
  });
  const deployment: Deployment = {
    plugins: options.plugins ?? {},
    minConnect: options.minConnect ?? null,
  };
  const answer = server(
    CloudApi,
    Layer.mergeAll(
      handlers(deployment).pipe(Layer.provide(table.layer)),
      options.guard,
    ),
  );
  const allowed = allowsOrigin(options.origins);
  const authBody = JSON.stringify(
    Schema.encodeSync(AuthInfo.schema)(options.authInfo),
  );
  return async (request: Request): Promise<Response> => {
    // Effect's HTTP client asks for `/rpc/`; either is the same path.
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
    if (pathname === AUTH_PATH && request.method === 'GET')
      return new Response(authBody, {
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        },
      });
    if (pathname.startsWith(`${SHELF_PATH}/`) && request.method === 'GET')
      return pluginFile(pathname, options.files);
    if (pathname !== RPC_PATH)
      return new Response('Not found', { status: 404 });
    const origin = request.headers.get('origin');
    if (origin !== null && !allowed(origin))
      return new Response('Forbidden', {
        status: 403,
        headers: { vary: 'Origin' },
      });
    const cors: Record<string, string> =
      origin === null ? { vary: 'Origin' } : corsFor(request, origin);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    const response = await answer(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  };
};

/**
 * Cloud Connect on a Worker's D1 binding `database`: callers sign in
 * through the Auth Worker `auth` names, pages on `origins` may call with
 * credentials, every Connection is told to run `plugins` and the Minimum
 * Connect `minConnect`, and the Plugins' files are served from `files`.
 */
export const serve = <Statement extends D1Statement<Statement>>(options: {
  readonly auth: AuthOptions;
  readonly origins: ReadonlyArray<string>;
  readonly database: D1SQLiteConfig<Statement>['database'];
  /** The physical name `D1.table` set the table up under. */
  readonly tableName?: string;
  readonly plugins?: Wanted;
  readonly minConnect?: string;
  readonly files?: PluginFiles;
}) => {
  const { auth: authOptions, database, ...rest } = options;
  return serveOver({
    ...rest,
    guard: auth.rpc(authOptions),
    authInfo: { url: authOptions.url },
    driver: makeD1SQLite({ database }),
  });
};

export { connectionsTable } from './storage/index.js';
