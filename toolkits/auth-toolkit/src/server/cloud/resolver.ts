import { Effect, Layer } from 'effect';

import { Authz, type Resolution } from '../../guard/index.js';
import { bearerToken } from '../authz/index.js';
import { verifyAccessToken } from '../plain/access-token/index.js';
import { verifyRequest } from '../plain/session/index.js';

export interface CloudOptions {
  /** The Auth Worker's own deployed URL. */
  authWorkerUrl: string;
  /** This Consumer Backend's audience, as listed in the Auth Worker's
   * `authorizationServer.resources`. Set it to make the backend a Resource
   * Server that accepts Access Tokens; omit it to accept Sign-ins only. */
  resource?: string;
}

const resolve = async (
  { authWorkerUrl, resource }: CloudOptions,
  request: Request,
): Promise<Resolution | null> => {
  const token = bearerToken(request);
  if (token !== null && resource !== undefined) {
    const verified = await verifyAccessToken({
      authWorkerUrl,
      resource,
      request,
    });
    if (verified !== null) {
      return {
        current: { kind: 'token', ...verified },
        refreshedCookies: [],
      };
    }
  }

  const verified = await verifyRequest({ authWorkerUrl, request });
  return verified === null
    ? null
    : {
        current: {
          kind: 'session',
          session: verified.session,
          user: verified.user,
        },
        refreshedCookies: verified.refreshedCookies,
      };
};

/** The cloud Resolver: asks the sign-in service about the request's cookie
 * or bearer, and verifies Access Tokens itself when given a `resource`. */
export const cloud = (config: CloudOptions) =>
  Layer.succeed(
    Authz.Resolver,
    Authz.Resolver.of({
      resolve: (request) => Effect.tryPromise(() => resolve(config, request)),
    }),
  );
