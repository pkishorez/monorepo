import { verifyBearerToken } from 'better-auth/oauth2';
import type { JWTPayload } from 'jose';

/** The claims the Auth Worker mints into every Access Token: OAuth's `sub`,
 * `client_id`, and `scope`, plus the `email` and `name` the Authorization
 * Server Role adds so a Resource Server needs no callback. */
interface AccessTokenClaims extends JWTPayload {
  sub: string;
  client_id: string;
  scope?: string;
  email: string;
  name: string;
}

/** What a valid Access Token establishes. */
export interface AccessTokenVerification {
  user: { id: string; email: string; name: string };
  client: { id: string };
  scopes: string[];
}

interface VerifyAccessTokenOptions {
  /** The Auth Worker's own deployed URL. */
  authWorkerUrl: string;
  /** This Resource Server's audience, exactly as listed in the Auth Worker's
   * `authorizationServer.resources`. */
  resource: string;
  /** The incoming request; only its `Authorization` header is read. */
  request: Request;
}

const BASE_PATH = '/api/auth';

const bearerToken = (request: Request) => {
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(
    ' ',
    2,
  );
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

/** Verifies an Access Token locally against the Auth Worker's JWKS (keys are
 * cached in-process), checking issuer, audience, and expiry. Resolves `null`
 * when the request carries no usable token; rejects only when the JWKS could
 * not be fetched, which is an Authentication Verification Failure. */
export const verifyAccessToken = async ({
  authWorkerUrl,
  resource,
  request,
}: VerifyAccessTokenOptions): Promise<AccessTokenVerification | null> => {
  const token = bearerToken(request);
  if (!token) return null;

  const issuer = `${authWorkerUrl}${BASE_PATH}`;
  let claims: AccessTokenClaims;
  try {
    // jose types only the registered claims; the rest are the Auth Worker's
    // own, declared above.
    claims = (await verifyBearerToken(token, {
      verifyOptions: { issuer, audience: resource },
      jwksUrl: `${issuer}/jwks`,
    })) as AccessTokenClaims;
  } catch (error) {
    // Better Auth reports a bad token (signature, expiry, audience, claims)
    // as an APIError; anything else is the JWKS being unreachable. The class
    // is matched by name because core and better-auth ship separate copies.
    if (error instanceof Error && error.name === 'APIError') return null;
    throw error;
  }
  if (!claims.sub || !claims.client_id || !claims.email) return null;

  return {
    user: { id: claims.sub, email: claims.email, name: claims.name ?? '' },
    client: { id: claims.client_id },
    scopes: claims.scope?.split(' ') ?? [],
  };
};
