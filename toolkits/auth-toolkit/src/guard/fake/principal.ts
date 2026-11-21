import { isTestEmail } from '../../contract/index.js';
import type { SignInPrincipal } from '../authz/middleware/index.js';
import { fakeToken, fakeUser } from './token.js';

// A fake token never expires.
const NEVER = new Date('9999-12-31T00:00:00.000Z');

/** The fake User `email` names, signed in with the Sign-in `id`; null when
 * the email is not at `FAKE_DOMAIN`. */
const signedIn = (
  input: { readonly email: string; readonly name?: string | undefined },
  id: string,
): SignInPrincipal | null => {
  const user = fakeUser(input);
  if (user === null) return null;
  return {
    kind: 'session',
    user: { id: user.id, email: user.email, name: user.name },
    session: { id, expiresAt: NEVER },
    test: isTestEmail(user.email),
  };
};

/** The Sign-in Principal a fake token names, asking no one; null for any
 * other token. Anyone may be any fake User, but only a fake User: the
 * email must be at `FAKE_DOMAIN`, and the User is made from it again, so a
 * token naming a real User's id names no one. */
export const fakePrincipal = (token: string): SignInPrincipal | null => {
  const named = fakeToken.read(token);
  return named === null ? null : signedIn(named, token);
};

/** The fake User `email` names on a Sign-in of its own, `id`, as a device
 * signed in as them holds one, for `fakeGuard.rpc({ as })`: the same User
 * as `fakeAccounts` signs in for that email. Null when the email is not at
 * `FAKE_DOMAIN`. */
export const fakeSignIn = (email: string, id: string): SignInPrincipal | null =>
  signedIn({ email }, id);
