import { localToken } from '../../contract/index.js';
import type { SignInPrincipal } from '../../guard/index.js';

// A Local Token never expires and was never issued, so its dates are fixed.
const EPOCH = new Date(0);
const NEVER = new Date('9999-12-31T00:00:00.000Z');

/** The Sign-in Principal a Local Token names, asking no one; null for any
 * other token. Any Local Token is accepted, so it fits only Local mode,
 * where anyone may be anyone. */
export const localPrincipal = (token: string): SignInPrincipal | null => {
  const user = localToken.read(token);
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
  };
};
