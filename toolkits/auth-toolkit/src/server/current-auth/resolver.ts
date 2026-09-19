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

const bearerToken = (request: Request): string | null => {
  const header = request.headers.get('authorization');
  const match = header ? /^bearer\s+(\S+)$/i.exec(header) : null;
  return match?.[1] ?? null;
};

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

export const resolverLive = (config: ResolverConfig) =>
  Layer.succeed(
    auth.Resolver,
    auth.Resolver.of({
      resolve: (request) => Effect.tryPromise(() => resolve(config, request)),
    }),
  );
