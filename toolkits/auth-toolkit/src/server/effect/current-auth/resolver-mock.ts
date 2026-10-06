import { Effect, Layer } from 'effect';

import { mockToken } from '../../../auth-worker-contract/index.js';
import { auth } from './current-auth.js';
import { bearerToken } from './resolver.js';

// A Mock Token never expires and was never issued, so its dates are fixed.
const EPOCH = new Date(0);
const NEVER = new Date('9999-12-31T00:00:00.000Z');

/** Current Auth from a Mock Token, asking no one: the bearer names its User.
 * A request without one, or with any other credential, is unauthenticated;
 * cookies are ignored. Any Mock Token is accepted, so it fits only a backend
 * where anyone may be anyone. */
export const resolverMock = Layer.succeed(
  auth.Resolver,
  auth.Resolver.of({
    resolve: (request) =>
      Effect.sync(() => {
        const token = bearerToken(request);
        const user = token === null ? null : mockToken.read(token);
        if (token === null || user === null) return null;
        return {
          currentAuth: {
            kind: 'session' as const,
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
          },
          refreshedCookies: [],
        };
      }),
  }),
);
