import { verifyBearerToken } from 'better-auth/oauth2';
import {
  accessTokenIdentity,
  authWorkerIssuer,
  authWorkerJwksUrl,
  type AccessTokenIdentity,
} from '../../auth-worker/index.js';

export type AccessTokenVerification = AccessTokenIdentity;

interface VerifyAccessTokenOptions {
  /** The Auth Worker's own deployed URL. */
  authWorkerUrl: string;
  /** This Resource Server's audience, as listed in the Auth Worker's
   * `authorizationServer.resources`. */
  resource: string;
  request: Request;
}

const bearerToken = (request: Request) => {
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(
    ' ',
    2,
  );
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

/** Resolves `null` for a missing or invalid token; rejects only when the JWKS
 * cannot be fetched. */
export const verifyAccessToken = async ({
  authWorkerUrl,
  resource,
  request,
}: VerifyAccessTokenOptions): Promise<AccessTokenVerification | null> => {
  const token = bearerToken(request);
  if (!token) return null;

  try {
    return accessTokenIdentity(
      await verifyBearerToken(token, {
        verifyOptions: {
          issuer: authWorkerIssuer(authWorkerUrl),
          audience: resource,
        },
        jwksUrl: authWorkerJwksUrl(authWorkerUrl),
      }),
    );
  } catch (error) {
    // core and better-auth ship separate APIError classes, so match by name.
    if (error instanceof Error && error.name === 'APIError') return null;
    throw error;
  }
};
