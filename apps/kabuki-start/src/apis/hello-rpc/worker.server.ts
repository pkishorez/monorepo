import { Effect, Layer } from 'effect';
import { Authz } from '@kestack/auth-toolkit';
import { auth } from '@kestack/auth-toolkit/server/rpc';
import { server } from '@kestack/rpc-toolkit/rpc/http';
import { HelloRpcs } from './contract.ts';

/*
 * The RPC Worker: answers each level's call, the guarded ones with who
 * called. The caller is read from the session cookie the browser sends,
 * checked with the Auth Worker; a guarded call with none is refused
 * Unauthenticated, and the authorized one from anyone but the owner
 * Forbidden. The site is on another
 * origin of the same site, so its origin, and only its, may call with
 * credentials; a preflight is answered here, since the RPC server answers
 * POST alone.
 */

/** What this Worker is handed by Alchemy. */
interface Env {
  readonly AUTH_URL: string;
  readonly SITE_ORIGIN: string;
}

const Handlers = HelloRpcs.toLayer({
  Public: () => Effect.succeed('Hello, whoever you are, from the RPC Worker'),
  Authenticated: () =>
    Effect.map(
      Authz.User,
      ({ user }) => `Hello ${user.name}, signed in, from the RPC Worker`,
    ),
  Authorized: () =>
    Effect.map(
      Authz.User,
      ({ user }) => `Hello ${user.name}, the owner, from the RPC Worker`,
    ),
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
 * Answers requests with `guard` telling who calls, letting `site` call
 * with credentials: `auth({ url })` in the Worker, `testAuth` in a test.
 */
export const serve = (guard: ReturnType<typeof auth>, site: string) => {
  const answer = server(HelloRpcs, Layer.mergeAll(Handlers, guard));
  return async (request: Request): Promise<Response> => {
    const cors = corsFor(request, site);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    const response = await answer(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  };
};

let served: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch: (request: Request, env: Env) =>
    (served ??= serve(auth({ url: env.AUTH_URL }), env.SITE_ORIGIN))(request),
};
