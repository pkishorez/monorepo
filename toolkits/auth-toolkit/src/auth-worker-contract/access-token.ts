import type { User } from './auth-worker-contract.js';

/** What an Access Token says: the User, the Client Application acting for
 * them, and the granted Scopes. */
export interface AccessTokenIdentity {
  user: { id: string; email: string; name: string };
  client: { id: string };
  scopes: string[];
}

/** The claims the Auth Worker adds so a Resource Server needs no callback to
 * know who is acting. */
export const accessTokenUserClaims = ({
  email,
  name,
}: Pick<User, 'email' | 'name'>) => ({ email, name });

interface AccessTokenClaims {
  sub: string;
  client_id: string;
  scope?: string;
  email: string;
  name?: string;
}

/** Reads a verified Access Token's claims. Verification is the caller's job. */
export const accessTokenIdentity = (
  claims: Readonly<Record<string, unknown>>,
): AccessTokenIdentity => {
  const { sub, client_id, scope, email, name } =
    claims as unknown as AccessTokenClaims;
  return {
    user: { id: sub, email, name: name ?? '' },
    client: { id: client_id },
    scopes: scope ? scope.split(' ') : [],
  };
};
