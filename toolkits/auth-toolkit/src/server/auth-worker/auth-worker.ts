import type { JWTPayload } from 'jose';

const BASE_PATH = '/api/auth';

export const authWorkerIssuer = (authWorkerUrl: string): string =>
  `${authWorkerUrl.replace(/\/$/, '')}${BASE_PATH}`;

export const authWorkerJwksUrl = (authWorkerUrl: string): string =>
  `${authWorkerIssuer(authWorkerUrl)}/jwks`;

interface AccessTokenClaims extends JWTPayload {
  sub: string;
  client_id: string;
  scope?: string;
  email: string;
  name?: string;
}

export interface AccessTokenIdentity {
  user: { id: string; email: string; name: string };
  client: { id: string };
  scopes: string[];
}

export const accessTokenIdentity = (
  claims: JWTPayload,
): AccessTokenIdentity => {
  const { sub, client_id, scope, email, name } = claims as AccessTokenClaims;
  return {
    user: { id: sub, email, name: name ?? '' },
    client: { id: client_id },
    scopes: scope ? scope.split(' ') : [],
  };
};
