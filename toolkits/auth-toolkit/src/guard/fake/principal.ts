import { isTestEmail } from '../../contract/index.js';
import type { SignInPrincipal } from '../authz/middleware/index.js';
import { fakeToken } from './token.js';

// A fake token never expires.
const NEVER = new Date('9999-12-31T00:00:00.000Z');

/** The Sign-in Principal a fake token names, asking no one; null for any
 * other token. Any fake token is accepted: anyone may be anyone. */
export const fakePrincipal = (token: string): SignInPrincipal | null => {
  const user = fakeToken.read(token);
  if (user === null) return null;
  return {
    kind: 'session',
    user: { id: user.id, email: user.email, name: user.name },
    session: { id: token, expiresAt: NEVER },
    test: isTestEmail(user.email),
  };
};
