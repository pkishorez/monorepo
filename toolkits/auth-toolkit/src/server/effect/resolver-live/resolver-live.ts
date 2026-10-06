import { Effect, Layer } from 'effect';

import { verifyAccessToken } from '../../vanilla/access-token/index.js';
import {
  auth,
  bearerToken,
  type CurrentAuthResolution,
} from '../current-auth/index.js';
import { verifyRequest } from '../../vanilla/session/index.js';

interface ResolverConfig {
  /** The Auth Worker's own deployed URL. */
  authWorkerUrl: string;
  /** This Consumer Backend's audience, as listed in the Auth Worker's
   * `authorizationServer.resources`. Set it to make the backend a Resource
   * Server that accepts Access Tokens; omit it to accept Sessions only. */
  resource?: string;
}

const resolve = async (
  { authWorkerUrl, resource }: ResolverConfig,
  request: Request,
): Promise<CurrentAuthResolution | null> => {
  const token = bearerToken(request);
  if (token !== null && resource !== undefined) {
    const verified = await verifyAccessToken({
      authWorkerUrl,
      resource,
      request,
    });
    if (verified !== null) {
      return {
        currentAuth: { kind: 'token', ...verified },
        refreshedCookies: [],
      };
    }
  }

  const verified = await verifyRequest({ authWorkerUrl, request });
  return verified === null
    ? null
    : {
        currentAuth: {
          kind: 'session',
          session: verified.session,
          user: verified.user,
        },
        refreshedCookies: verified.refreshedCookies,
      };
};

/** The production Current Auth Resolver: asks the Auth Worker about the
 * request's cookie or bearer, and verifies Access Tokens itself when given
 * a `resource`. Kept apart from the rest of Current Auth because it brings
 * better-auth's server code, which a device-only backend never needs. */
export const resolverLive = (config: ResolverConfig) =>
  Layer.succeed(
    auth.Resolver,
    auth.Resolver.of({
      resolve: (request) => Effect.tryPromise(() => resolve(config, request)),
    }),
  );
