import { Effect, Layer } from 'effect';

import { nameToken } from '../../contract/index.js';
import { Authz } from '../../guard/index.js';
import { bearerToken } from './bearer-token.js';

// A Name Token never expires and was never issued, so its dates are fixed.
const EPOCH = new Date(0);
const NEVER = new Date('9999-12-31T00:00:00.000Z');

/** The device Resolver: who a call is from, read from its Name Token and
 * asking no one. A request without one, or with any other credential, is
 * unauthenticated; cookies are ignored. Any Name Token is accepted, so it
 * fits only the device Backend, where anyone may be anyone. */
export const device = Layer.succeed(
  Authz.Resolver,
  Authz.Resolver.of({
    resolve: (request) =>
      Effect.sync(() => {
        const token = bearerToken(request);
        const user = token === null ? null : nameToken.read(token);
        if (token === null || user === null) return null;
        return {
          current: {
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
