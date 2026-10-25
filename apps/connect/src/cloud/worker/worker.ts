import { Effect, Layer } from 'effect';
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
  type AuthInfo,
  CloudApi,
  RPC_PATH,
} from '../contract/index.js';
import { Registry } from './registry/index.js';
import { machinesTable } from './storage/index.js';

/*
 * Cloud Connect: `CloudApi` for the signed-in caller over the `machines`
 * table, as one `(request) => Promise<Response>`.
 *
 * - `GET /auth` answers the AuthInfo it was given, to anyone: how a Machine
 *   signs in here.
 * - `POST /rpc` is the RPC. The caller is checked by auth-toolkit's Guard,
 *   asking the Auth Worker; a call with no Sign-in is refused
 *   Unauthenticated.
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
 * `D1.table(machinesTable)`.
 */

/** The calls' handlers. */
const handlers = CloudApi.toLayer({
  Report: (input) =>
    Effect.flatMap(Authz.User, (principal) =>
      Registry.report(principal, input),
    ),
  List: () => Effect.flatMap(Authz.User, Registry.list),
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
 * Answers requests over the `machines` table on `driver`, with `guard`
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
}) => {
  const table = SQLite.make(machinesTable, { database: options.driver });
  const answer = server(
    CloudApi,
    Layer.mergeAll(handlers.pipe(Layer.provide(table.layer)), options.guard),
  );
  const allowed = allowsOrigin(options.origins);
  const authBody = JSON.stringify(options.authInfo);
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
 * through the Auth Worker `auth` names, and pages on `origins` may call
 * with credentials.
 */
export const serve = <Statement extends D1Statement<Statement>>(options: {
  readonly auth: AuthOptions;
  readonly origins: ReadonlyArray<string>;
  readonly database: D1SQLiteConfig<Statement>['database'];
}) =>
  serveOver({
    guard: auth.rpc(options.auth),
    authInfo: { url: options.auth.url },
    origins: options.origins,
    driver: makeD1SQLite({ database: options.database }),
  });

export { machinesTable } from './storage/index.js';
