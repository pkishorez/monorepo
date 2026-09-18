import { Effect, Layer } from 'effect';

import { verifyAccessToken } from '../verification/access-token/index.js';
import { auth, type CurrentAuthResolution } from './current-auth.js';
import { verifyRequest } from '../verification/session/index.js';

interface ResolverConfig {
  /** The Auth Worker's own deployed URL. */
  authWorkerUrl: string;
  /** This Consumer Backend's audience, as listed in the Auth Worker's
   * `authorizationServer.resources`. Set it to make the backend a Resource
   * Server that accepts Access Tokens; omit it to accept Sessions only. */
  resource?: string;
}

const hasAuthorizationHeader = (request: Request) =>
  request.headers.has('authorization');

/** Resolves Current Auth from either credential. A request carrying an
 * `Authorization` header is treated as an Access Token and never falls back
 * to its cookie; without a `resource` such a request has no valid Principal. */
const resolve = (
  { authWorkerUrl, resource }: ResolverConfig,
  request: Request,
): Promise<CurrentAuthResolution | null> => {
  if (hasAuthorizationHeader(request)) {
    if (resource === undefined) return Promise.resolve(null);
    return verifyAccessToken({ authWorkerUrl, resource, request }).then(
      (verified) =>
        verified === null
          ? null
          : {
              currentAuth: { kind: 'token', ...verified },
              refreshedCookies: [],
            },
    );
  }
  return verifyRequest({ authWorkerUrl, request }).then((verified) =>
    verified === null
      ? null
      : {
          currentAuth: {
            kind: 'session',
            session: verified.session,
            user: verified.user,
          },
          refreshedCookies: verified.refreshedCookies,
        },
  );
};

export const resolverLive = (config: ResolverConfig) =>
  Layer.succeed(
    auth.Resolver,
    auth.Resolver.of({
      resolve: (request) => Effect.tryPromise(() => resolve(config, request)),
    }),
  );
