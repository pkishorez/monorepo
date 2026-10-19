import { verifyBearerToken } from 'better-auth/oauth2';

import {
  accessTokenIdentity,
  authWorkerIssuer,
  authWorkerJwksUrl,
  type AccessTokenIdentity,
} from '../../contract/index.js';

/** Checks an Access Token against the Auth Worker's published keys, asking
 * no one per call. Resolves null for a token that is not a valid Access
 * Token for `resource`; rejects only when the keys cannot be fetched. */
export const verifyAccessToken = async (
  url: string,
  resource: string,
  token: string,
): Promise<AccessTokenIdentity | null> => {
  try {
    return accessTokenIdentity(
      await verifyBearerToken(token, {
        verifyOptions: { issuer: authWorkerIssuer(url), audience: resource },
        jwksUrl: authWorkerJwksUrl(url),
      }),
    );
  } catch (error) {
    // core and better-auth ship separate APIError classes, so match by name.
    if (error instanceof Error && error.name === 'APIError') return null;
    throw error;
  }
};
