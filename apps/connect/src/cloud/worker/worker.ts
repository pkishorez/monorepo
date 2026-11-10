import { Layer, Schema } from 'effect';
import { auth, type AuthOptions } from '@kestack/auth-toolkit/server';
import { server } from '@kestack/rpc-toolkit/rpc/http';
import { SQLite, type SQLiteDriver } from '@kestack/std-toolkit/db/sqlite';
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
  UPGRADE_REQUIRED,
  VERSION_HEADER,
} from '../../heartbeat/index.js';
import { allowsOrigin } from '../../connection/link/index.js';
import { AppApi, RPC_PATH } from '../app-api/index.js';
import { appHandlers } from './app/index.js';
import { heartbeatHandlers } from './heartbeat/index.js';
import {
  connectionsTable,
  type Latest,
  RELEASE_PATH,
  releaseFile,
  type ReleaseFiles,
} from './store/index.js';

/*
 * Connect Cloud: two RPCs for the signed-in caller over the `connections`
 * table (store/), as one `(request) => Promise<Response>`. It has two jobs,
 * Connections and Releases, and this file only routes to them.
 *
 * - `GET /auth` answers the AuthInfo it was given, to anyone: how a Connection
 *   signs in here.
 * - `POST /heartbeat` is the Heartbeat (heartbeat/), which only `ke-connect`
 *   calls: a Report, and Forget. Every Connection is told `wanted`, the latest
 *   Release of each Plugin, none unless given. No browser calls it, so a call
 *   that names an Origin is refused 403 before it is read, and no CORS is
 *   answered. Given `minConnect`, the Minimum Connect, a call whose
 *   `ke-connect-version` is below it, or missing, is answered 426 and one
 *   line of plain text, before it is read or its Sign-in checked: an answer
 *   every `ke-connect` from ADR 0011 on reads, and which never changes. The
 *   App's list names the Minimum Connect, null unless given.
 * - `POST /rpc` is what an App calls (app/): List, Rename, Forget, and
 *   `Standing`, which says where a Release stands, by `wanted` and `files`.
 * - Both check the caller with auth-toolkit's Guard, asking the Auth Worker; a
 *   call with no Sign-in is refused Unauthenticated.
 * - `GET /releases/<name>/<sha256>.mjs` answers that Release File from `files`,
 *   to anyone. Anything else there, or no `files`, is 404.
 * - Apps are on other origins of the same site: an origin matching one of
 *   `origins` (patterns, see connection/link/) may call `/rpc` with
 *   credentials, its own origin echoed back, and its preflight is answered
 *   here, since the RPC server answers POST alone. A call from any other
 *   origin is refused 403 before it is read: another page of the same site
 *   would send the User's cookie with a simple POST. A call with no Origin is
 *   no browser's and goes ahead.
 *
 * The Worker is a few lines over `serve`, reading its env (see
 * worker.server.ts). The table itself is made at deploy, by
 * `D1.table(connectionsTable)`.
 */

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
  readonly wanted?: Latest['wanted'];
  readonly minConnect?: string;
  readonly files?: ReleaseFiles;
}) => {
  const table = SQLite.make(connectionsTable, { database: options.driver });
  const latest: Latest = {
    wanted: options.wanted ?? {},
    minConnect: options.minConnect ?? null,
  };
  const heartbeat = server(
    HeartbeatApi,
    Layer.mergeAll(
      heartbeatHandlers(latest).pipe(Layer.provide(table.layer)),
      options.guard,
    ),
  );
  const app = server(
    AppApi,
    Layer.mergeAll(
      appHandlers(latest, options.files).pipe(Layer.provide(table.layer)),
      options.guard,
    ),
  );
  const allowed = allowsOrigin(options.origins);
  const authBody = JSON.stringify(
    Schema.encodeSync(AuthInfo.schema)(options.authInfo),
  );
  return async (request: Request): Promise<Response> => {
    // Effect's HTTP client asks for `/rpc/` and `/heartbeat/`; either is the
    // same path.
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
    if (pathname === AUTH_PATH && request.method === 'GET')
      return new Response(authBody, {
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        },
      });
    if (pathname.startsWith(`${RELEASE_PATH}/`) && request.method === 'GET')
      return releaseFile(pathname, options.files);
    const origin = request.headers.get('origin');
    if (pathname === HEARTBEAT_PATH) {
      if (origin !== null) return new Response('Forbidden', { status: 403 });
      const outdated = outdatedLine(
        request.headers.get(VERSION_HEADER),
        latest.minConnect,
      );
      // Frozen: the status and one plain-text line, whatever else changes.
      return outdated === null
        ? heartbeat(request)
        : new Response(outdated, {
            status: UPGRADE_REQUIRED,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
    }
    if (pathname !== RPC_PATH)
      return new Response('Not found', { status: 404 });
    if (origin !== null && !allowed(origin))
      return new Response('Forbidden', {
        status: 403,
        headers: { vary: 'Origin' },
      });
    const cors: Record<string, string> =
      origin === null ? { vary: 'Origin' } : corsFor(request, origin);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    const response = await app(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  };
};

/**
 * Connect Cloud on a Worker's D1 binding `database`: callers sign in through
 * the Auth Worker `auth` names, pages on `origins` may call with credentials,
 * every Connection is told to run `wanted`, one below the Minimum Connect
 * `minConnect` is refused 426, and Release Files are served from `files`.
 */
export const serve = <Statement extends D1Statement<Statement>>(options: {
  readonly auth: AuthOptions;
  readonly origins: ReadonlyArray<string>;
  readonly database: D1SQLiteConfig<Statement>['database'];
  readonly wanted?: Latest['wanted'];
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

export { connectionsTable };
