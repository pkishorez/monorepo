import { Effect, Layer } from 'effect';
import { Authz } from '@kestack/auth-toolkit';
import { auth } from '@kestack/auth-toolkit/server/rpc';
import { server } from '@kestack/rpc-toolkit/rpc/http';
import { SQLite, type SQLiteDriver } from '@kestack/std-toolkit/db/sqlite';
import {
  type D1SQLiteConfig,
  type D1Statement,
  makeD1SQLite,
} from '@kestack/std-toolkit/db/sqlite/d1';
import {
  AUTH_PATH,
  type AuthInfo,
  MachinesApi,
  RPC_PATH,
} from '../contract/index.js';
import { Registry } from './registry/index.js';
import { machinesTable } from './storage/index.js';

/*
 * The Machines Backend: `MachinesApi` for the signed-in caller over the
 * `machines` table, as one `(request) => Promise<Response>`.
 *
 * - `GET /auth` answers the AuthInfo it was given, to anyone: how a Machine
 *   signs in here.
 * - `POST /rpc` is the RPC. The caller is checked by auth-toolkit's Guard,
 *   asking the Auth Worker, or reading Local Tokens in Local mode; a call
 *   with no Sign-in is refused Unauthenticated.
 * - The app is on another origin of the same site: its origin, and only its,
 *   may call `/rpc` with credentials, and its preflight is answered here,
 *   since the RPC server answers POST alone.
 *
 * The app's Worker is a few lines over `serve`, reading its env:
 *
 *   export default {
 *     fetch: (request, env) => (served ??= serve({
 *       auth: env.AUTH_URL ? { url: env.AUTH_URL } : { local: true },
 *       site: env.SITE_ORIGIN,
 *       database: env.DB,
 *     }))(request),
 *   };
 *
 * The table itself is made at deploy, by `D1.table(machinesTable)`.
 */

const Handlers = MachinesApi.toLayer({
  Report: (input) =>
    Effect.flatMap(Authz.User, (principal) =>
      Registry.report(principal, input),
    ),
  List: () => Effect.flatMap(Authz.User, Registry.list),
  Forget: ({ id }) =>
    Effect.flatMap(Authz.User, (principal) => Registry.forget(principal, id)),
});

/** The CORS headers for `request`: its origin is echoed only when it is the site's. */
const corsFor = (request: Request, site: string): Record<string, string> =>
  request.headers.get('origin') === site
    ? {
        'access-control-allow-origin': site,
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers':
          request.headers.get('access-control-request-headers') ?? '',
        'access-control-max-age': '600',
        vary: 'Origin',
      }
    : { vary: 'Origin' };

/**
 * Answers requests over the `machines` table on `driver`, with `guard`
 * telling who calls and `authInfo` what `/auth` answers, letting `site`
 * call with credentials. For a test (`testAuth`) or a local SQLite file; a
 * Worker uses {@link serve}. The table must be set up already.
 */
export const serveOver = (options: {
  readonly guard: ReturnType<typeof auth>;
  readonly authInfo: AuthInfo;
  readonly site: string;
  readonly driver: SQLiteDriver;
}) => {
  const table = SQLite.make(machinesTable, { database: options.driver });
  const answer = server(
    MachinesApi,
    Layer.mergeAll(Handlers.pipe(Layer.provide(table.layer)), options.guard),
  );
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
    const cors = corsFor(request, options.site);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    const response = await answer(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  };
};

/**
 * The Machines Backend on a Worker's D1 binding `database`: callers sign in
 * as `auth` says (the Auth Worker's URL, or Local mode), and the app at
 * origin `site` may call with credentials.
 */
export const serve = <Statement extends D1Statement<Statement>>(options: {
  readonly auth: AuthInfo;
  readonly site: string;
  readonly database: D1SQLiteConfig<Statement>['database'];
}) =>
  serveOver({
    guard: auth(options.auth),
    authInfo: options.auth,
    site: options.site,
    driver: makeD1SQLite({ database: options.database }),
  });

export { machinesTable } from './storage/index.js';
