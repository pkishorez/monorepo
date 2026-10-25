import { isTestEmail } from '../../contract/index.js';
import type { SignInPrincipal } from '../authz/middleware/index.js';
import { fakeToken, fakeUser } from './token.js';

// A fake token never expires.
const NEVER = new Date('9999-12-31T00:00:00.000Z');

/** The Sign-in Principal a fake token names, asking no one; null for any
 * other token. Anyone may be any fake User, but only a fake User: the
 * email must be at `FAKE_DOMAIN`, and the User is made from it again, so a
 * token naming a real User's id names no one. */
export const fakePrincipal = (token: string): SignInPrincipal | null => {
  const named = fakeToken.read(token);
  const user = named === null ? null : fakeUser(named);
  if (user === null) return null;
  return {
    kind: 'session',
    user: { id: user.id, email: user.email, name: user.name },
    session: { id: token, expiresAt: NEVER },
    test: isTestEmail(user.email),
  };
};
