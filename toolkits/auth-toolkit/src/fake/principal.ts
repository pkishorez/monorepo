import { isTestEmail } from '../contract/index.js';
import type { SignInPrincipal } from '../guard/index.js';
import { fakeToken } from './token.js';

// A fake token never expires and was never issued, so its dates are fixed.
const EPOCH = new Date(0);
const NEVER = new Date('9999-12-31T00:00:00.000Z');

/** The Sign-in Principal a fake token names, asking no one; null for any
 * other token. Any fake token is accepted: anyone may be anyone. */
export const fakePrincipal = (token: string): SignInPrincipal | null => {
  const user = fakeToken.read(token);
  if (user === null) return null;
  return {
    kind: 'session',
    user: {
      ...user,
      emailVerified: true,
      image: null,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    },
    session: {
      id: token,
      token,
      userId: user.id,
      expiresAt: NEVER,
      createdAt: EPOCH,
      updatedAt: EPOCH,
      ipAddress: null,
      userAgent: null,
    },
    test: isTestEmail(user.email),
  };
};
